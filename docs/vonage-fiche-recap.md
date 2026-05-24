# Fiche récap — Intégration Vonage Video API

> Feuille de révision pour l'entretien. Enrichie au fur et à mesure de l'implémentation.

---

## 1. dotenv

**Rôle :** Lire le fichier `.env` et injecter les variables dans `process.env` avant l'exécution du reste du code.

**Règle critique :** `require('dotenv').config()` doit être la **première ligne** de `server.js`. Si un module est requis avant, il s'initialise avec `process.env.MA_VAR = undefined`.

---

## 2. Session Vonage

**Définition :** Une "salle" virtuelle avec un identifiant unique (`sessionId`). Créée une fois côté serveur via l'API REST Vonage.

**Règle :** Broadcaster et viewers doivent rejoindre la **même** session. Dans notre MVP, une seule session est créée pour toute la durée de vie du serveur (`let vonageSessionId = null` + lazy init).

**Créée avec :** `vonageVideo.createSession({ mediaMode: MediaMode.ROUTED })`

---

## 3. Token Vonage

**Définition :** JWT signé avec la **Private Key RSA** du serveur. Prouve qu'un client a le droit d'entrer dans une session avec un rôle donné.

**Rôles :**
- `publisher` → peut envoyer du media (broadcaster)
- `subscriber` → peut seulement recevoir (viewer)

**Généré avec :** `vonageVideo.generateClientToken(sessionId, { role })`

**Règle de sécurité :** Toujours généré côté serveur. La Private Key ne quitte jamais le serveur — même Vonage ne la connaît pas (asymétrique). JWT offre aussi la révocation stateless : une fois expiré, aucun appel serveur pour l'invalider.

**Différence OpenTok vs Managed Video API :**
| | OpenTok (ancien) | Managed Video API (nouveau) |
|---|---|---|
| Identifiant | API Key (numérique) | Application ID (UUID) |
| Secret | API Secret | Private Key RSA |
| Signature | HMAC symétrique | JWT asymétrique RS256 |
| SDK npm | `opentok` | `@vonage/video` |

---

## 4. MediaMode

| Mode | Comportement | Upload broadcaster |
|------|-------------|-------------------|
| `ROUTED` | Tout transite par le SFU Vonage | 1× (indépendant du nb de viewers) |
| `RELAYED` | P2P avec fallback Vonage | N× (une connexion par viewer) |

On utilise `ROUTED` : c'est l'avantage clé de Vonage vs un P2P maison.

---

## 5. SignalingAdapter — l'interface commune

**Rôle :** Définir le contrat que toutes les implémentations (P2P, Vonage...) doivent respecter.

**Pattern :** Strategy — les implémentations sont interchangeables derrière une interface commune. broadcaster.js et viewer.js programment contre l'interface, jamais contre une implémentation concrète.

**Les 4 callbacks :**
| Callback | Qui | Quand |
|---|---|---|
| `onStream(stream)` | viewer | Un flux video arrive |
| `onViewerCount(n)` | broadcaster | Un viewer rejoint ou quitte |
| `onStatus(msg)` | les deux | Changement d'état réseau |
| `onError(msg)` | les deux | Quelque chose a échoué |

**Règle ordre :** Toujours enregistrer les callbacks AVANT d'appeler `connect()`. Les events peuvent arriver dès la connexion établie — callbacks non enregistrés = events silencieusement perdus.

**Method chaining :** Chaque `on*()` retourne `this` → `adapter.onStream(cb).onError(cb).connect('viewer')`

**Simulation d'interface en JS :** Pas d'interface compilée en JS vanilla. On `throw` dans la classe de base si une méthode n'est pas surchargée — erreur explicite à l'exécution plutôt qu'un `undefined` silencieux.

---

## 6. P2PAdapter

**Rôle :** Encapsule toute la logique Socket.io + RTCPeerConnection extraite de broadcaster.js et viewer.js. Socket.io n'est instancié (`io()`) que si cet adapter est utilisé — VonageAdapter ne l'ouvre jamais.

**Bifurcation interne :** `connect(role)` dispatche vers `_connectAsBroadcaster()` ou `_connectAsViewer()`. L'interface reste uniforme côté appelant.

**`_peers` map (broadcaster) :** `{ viewerId → RTCPeerConnection }` — une connexion par viewer. Le compteur de viewers est recalculé depuis les clés de la map (pas un compteur séparé qui pourrait dériver).

**ICE buffering (viewer) :** Les ICE candidates peuvent arriver AVANT que `setRemoteDescription()` soit terminé. On les bufférise dans `iceCandidates[]` et on les flush après — sinon elles sont silencieusement ignorées.

**`addTrack()` avant `createOffer()` :** Obligatoire. Sans ça, le SDP généré n'a pas de section `m=video`/`m=audio` et aucun média ne circule.

**`disconnect()` :** Ferme toutes les `RTCPeerConnection` et déconnecte Socket.io — lié au cycle de vie de l'adapter, pas à la page.

---

## 7. VonageAdapter — objets clés OT

**`OT.initSession(applicationId, sessionId)`**
→ Crée un objet JS local. **Aucun réseau.** Attacher les listeners ici, avant `connect()`.

**`session.connect(token, callback)`**
→ Connexion réseau réelle (WebSocket vers Vonage). Le token JWT prouve l'identité et le rôle.

**`session.publish(publisher)`**
→ Envoie le flux media vers le SFU Vonage. Une seule fois, quelle que soit le nombre de viewers.

**`session.subscribe(stream, container)`**
→ Reçoit un flux depuis le SFU. Vonage crée un `<video>` dans `container`.

**Événements clés :**
| Événement | Quand | Équivalent P2P |
|---|---|---|
| `streamCreated` | Un participant commence à publier | `viewer-joined` (inversé : c'est le viewer qui reçoit) |
| `streamDestroyed` | Le flux s'arrête | `broadcaster-left` |
| `connectionCreated` | Un participant rejoint la session | `connect` Socket.io |
| `connectionDestroyed` | Un participant quitte | `disconnect` Socket.io |
| `videoElementCreated` | Vonage a créé le `<video>` du subscriber | `pc.ontrack` |

**Différence fondamentale vs P2P :** Avec Vonage SFU, le SDP et les ICE candidates sont gérés en interne — tu n'y as jamais accès. C'est ce qui rend le SDK simple mais moins transparent que du WebRTC brut.

---

## 8. Factory + refacto broadcaster/viewer

**`createAdapter()` est async** car elle doit `fetch('/config')` avant d'instancier — sans async/await on retournerait une Promise non résolue.

**Ordre des scripts (sans modules ES) :**
```
OpenTok.js → socket.io → SignalingAdapter → P2PAdapter → VonageAdapter → index.js → broadcaster.js
```
Chaque script suppose ses dépendances déjà définies dans le scope global. Inversion = `undefined` à l'exécution. ES modules (`type="module"`) et bundlers (Webpack, Vite) résolvent ça automatiquement.

**broadcaster.js : 160 → 40 lignes**
Ce qui reste : UI + `createAdapter()`. Ce qui a disparu : tout le signaling (SDP, ICE, peers, socket events) — maintenant dans `P2PAdapter`/`VonageAdapter`. broadcaster.js exprime son *intention*, pas son *implémentation*.

---

## 9. Architecture adapter pattern

```
.env  SIGNALING_ADAPTER=vonage|p2p
         │
         ▼
GET /config → { adapter: "vonage" }
         │
         ▼
createAdapter() → VonageAdapter | P2PAdapter
         │
         ▼
SignalingAdapter (interface commune)
  .onStream(cb)
  .onViewerCount(cb)
  .connect(role, localStream)
  .disconnect()
```

**Principe :** broadcaster.js et viewer.js ne savent pas quelle implémentation ils utilisent. Changer d'adapter = changer une variable d'env + redémarrer le serveur.

---

## 6. OT (OpenTok.js) — objets clés

*(Section remplie à l'étape VonageAdapter)*

---

## 7. SFU vs P2P — argumentaire

*(Section remplie à l'étape VonageAdapter)*
