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

## 6. Architecture adapter pattern

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
