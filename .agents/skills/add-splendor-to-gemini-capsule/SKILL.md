---
name: add-splendor-to-gemini-capsule
description: Add the Splendor card game under /splendor/ of a Gemini capsule that runs on a Cloud in a Bottle instance as the bottled-gemini app. Carries the game, its Gemini front door, its tests and the patch for the capsule's Dockerfile and start script. Use when the owner wants Splendor, or another interactive Gemini page, on their capsule.
---

# Add Splendor to a Gemini capsule

Facts and steps only. The wording players see is the owner's to write.

## What this adds

- `splendor/` in the capsule's repo: a Node front door (`server.js`, no npm dependencies, Node 18 or newer), the game
  (`game.js`, `render.js`, `handler.js`, `store.js`, card and noble data) and tests.
- `files/hookup.patch`: the changes to `Dockerfile` (install `nodejs`, copy `splendor/*.js` and `*.json`) and
  `start.sh` (agate moves to 127.0.0.1:1966, the front door takes public 1965 and passes everything except
  `/splendor/` to agate unchanged). Made against cloud-in-a-bottle/bottled-gemini at commit d562a41.
- The game is ported from boweiliu/splendor-server. Players are identified by Gemini client certificate: no
  certificate gets status 60. First identity into a game is player 1, second is player 2, later ones spectate.
  A game id `:n=2:name` is a two-player game with enforced turns; a plain name is a solo sandbox.
- Games are saved in `<app data dir>/splendor/games.json` and dropped after 30 idle days; at most 300 at a time.

## Steps

1. Preconditions: the capsule is deployed from a repo as the app `gemini`, the instance can clone that repo, and the
   owner API token is a workspace secret (read only through `with_secrets.py`). The upstream repo has no license
   file; a private copy is fine, ask before publishing one.
2. Clone the capsule's repo to `.external_worktrees/<name>/`. Work on a branch.
3. Copy `files/splendor/` to `splendor/` in the clone, then `git apply files/hookup.patch`. If the capsule's
   `Dockerfile` or `start.sh` has drifted and the patch does not apply, make the same changes by hand.
4. Fill the wording. Every string the game shows that is not from the original splendor-server is in
   `splendor/copy.js` as `[BOWEI: ...]` instructions. Ask the owner for each one. Do not write it for them.
5. Run `node --test splendor/test/game.test.js splendor/test/server.test.js` (needs `openssl`). The tests use the
   strings from `copy.js`, so they pass with placeholders or real wording.
6. Put the commit where the instance can clone it, then deploy. There is no in-place change of an app's source:
   a. Dry run: `POST /api/add_app` as JSON `{"repo_url", "app_name": "<name>-test", "port_overrides": {"gemini": 19650}}`
      with header `X-OpenHost-Authorization: Bearer <owner token>`. Wait for `running` in `GET /api/app_status/<id>`,
      read `GET /app_logs/<id>` for `[splendor] gemini front door ... on :1965`, then `POST /remove_app/<id>`.
   b. Live swap: `POST /remove_app/<live id>` with `{"keep_data": "1"}`, wait until it leaves `GET /api/apps`, then
      `add_app` with `"app_name": "gemini"`. The old container frees port 1965 late: retry on a 400 saying the port
      is in use. Pages, the certificate and saved games survive. The capsule is down for about a minute.
   c. Later code changes: push, then `POST /reload_app/<id>` with `{"update": "1", "approve_new_permissions": "1"}`.
      This can hit the same port race and land in `error`; reload again.
7. Check from outside, with the TLS name set to the capsule hostname (a different name gets alert 49 from agate):
   `gemini://<host>/` answers 20, `gemini://<host>/splendor/` answers 20, `/splendor/g/x` without a client
   certificate answers 60, `https://<host>/healthz` answers 200.
8. A link to `/splendor/` on the capsule's front page is edited with `PUT https://<host>/api/files/index.gmi`
   (JSON `{"content": ...}`, same owner header). The link text is the owner's wording.

## Things that were true when this was built

- agate 3.3.22 writes `cert.der` and `key.der` under `certs/<hostname>/`, not PEM. The front door reads either.
- The sidecar's `/healthz` probes port 1965, which is now the front door; it still answers.
- agate's own log shows 127.0.0.1 for every client, since requests reach it from the front door.
- Status codes the front door returns itself: 60 no client certificate, 51 unknown path, 41 too many games,
  59 malformed request, 43 agate unreachable, 42 handler exception.
