---
title: "Splendor for a Gemini capsule"
description: "Skill that adds the Splendor card game under /splendor/ of a bottled-gemini capsule on a Cloud in a Bottle instance: front door, game, tests and the startup patch."
thumbnail: "template.svg"
version: v1
format: v2
---

# Splendor for a Gemini capsule

This file is the manifest for the **Splendor for a Gemini capsule** template (slug:
`splendor-for-a-gemini-capsule`). It is the one document a future agent reads to understand,
present, and adapt this template. If you are an agent in a workspace that was
created from this template, this file is your script: read all of it, then
follow "How to adapt it" below.

## What it is

This template is one skill, `add-splendor-to-gemini-capsule`. It puts the Splendor card game on a Gemini capsule: a small Gemini-protocol site that runs on a Cloud in a Bottle instance as the `bottled-gemini` app (upstream `cloud-in-a-bottle/bottled-gemini`). Once the skill has been run, the capsule serves the game under `/splendor/`. Players use any Gemini client, create a client certificate (their identity), and play by typing short commands. A game named `:n=2:name` is a two-player game with enforced turns, and a plain name is a solo sandbox. The first identity into a game is player 1, the second is player 2, and later ones spectate.

The template has no app and no running service in the workspace. The skill's job is to patch a separate git repo (the capsule's) and redeploy it through the instance's owner API. Nothing in it writes the words players see: every string the game shows that is not carried over from the original web game (`boweiliu/splendor-server`) lives in `files/splendor/copy.js` as a `[BOWEI: ...]` placeholder written as an instruction. The adopter's owner must fill all 22 in. The published copy ships the placeholders unchanged.

## How it works

The snapshot includes these paths (each is a repo-root-relative path copied
from the original agent onto a clean default-workspace-template base):

- `.agents/skills/add-splendor-to-gemini-capsule`

- `.agents/skills/add-splendor-to-gemini-capsule/SKILL.md` -- the skill: preconditions, and the steps to clone the capsule's repo, add the game, deploy it and check it.
- `.agents/skills/add-splendor-to-gemini-capsule/files/splendor/` -- the game's source, copied into `splendor/` of the capsule's repo. `server.js` is a Node front door (no npm dependencies, Node 18 or newer) that takes the public port 1965, answers `/splendor/` itself and passes every other request to agate unchanged. `game.js`, `render.js`, `handler.js`, `store.js` and the card and noble JSON are the game. `copy.js` holds the placeholder wording. `test/` has the game and server tests, run with `node --test`.
- `.agents/skills/add-splendor-to-gemini-capsule/files/hookup.patch` -- the change to the capsule's `Dockerfile` (install `nodejs`, copy the game's `.js` and `.json` files) and `start.sh` (agate moves to 127.0.0.1:1966, the front door starts on 1965). Made against `cloud-in-a-bottle/bottled-gemini` at commit `d562a41`. If the upstream files have drifted, the skill says to make the same changes by hand.

At run time nothing in the workspace is started: no supervisord program, no port, no `forward_port.py` entry. The skill works in a clone under `.external_worktrees/<name>/` and talks to the Cloud in a Bottle instance's owner API (`add_app`, `remove_app`, `app_status`, `app_logs`, `reload_app`, and the capsule's `/api/files/` editor). The game itself runs inside the capsule's container next to agate and the capsule's HTTP sidecar. Games are saved in the capsule's app data dir under `splendor/games.json` and dropped after 30 idle days, with at most 300 at a time.

## Recipe

This template is version `v1`. It is not a fork of the
workspace it came from -- it is DERIVED from it by a recipe: include these
paths, leave these out, apply these published-version rules. An update re-runs
the recipe against the current workspace and publishes the result as the next
version, so anything excluded stays excluded even though it still exists in the
source workspace.

The recipe is machine-read, so it lives in the sibling
[`template.toml`](template.toml) -- its `[recipe]` table -- along with
the structured requirements and the environment this template needs
installed. That file is authoritative for all of it; this one holds the prose.

## Requirements

Everything the adopting agent must deal with before this template is really
theirs. Two kinds of entry, handled at different times:

- **Activation** -- what must be SET UP before anything runs, in the
  machine-readable `requires_` forms below. The adopting agent acts on these
  ITSELF, first, before asking anything.
- **Adaptation** -- what must be DECIDED or REWIRED, in prose. Worked through
  interactively with the user, after activation.


- requires_secret: data/.secrets/cloud-in-a-bottle-owner.env with CLOUD_IN_A_BOTTLE_OWNER_TOKEN (the owner API token of the Cloud in a Bottle instance that runs the capsule, sent as X-OpenHost-Authorization: Bearer and read only through with_secrets.py)

Adaptation:

- A capsule to patch. The adopter needs a Cloud in a Bottle instance running the `bottled-gemini` app, deployed from a git repo as the app named `gemini`. The skill's deploy steps assume that name and the capsule's current `Dockerfile` and `start.sh`; if they differ from upstream commit `d562a41`, the patch has to be applied by hand.
- A git remote the instance can clone. The deploy swaps the app's repo, so the patched capsule must be pushed somewhere the instance can reach (a private repo on the adopter's own host works). The adopter chooses it and supplies push access.
- Wording. `files/splendor/copy.js` has 22 `[BOWEI: ...]` placeholders, each an instruction for one string the game shows (home page text, link texts, error and status messages). They were written for the original owner and ship unchanged. The adopter's owner must write each string; an agent must ask for it and must not write it. The tests pass with placeholders or real wording.
- The capsule front page link. Step 8 of the skill edits the capsule's `index.gmi` to link to `/splendor/`; the link text is also the owner's wording.
- Licence. The upstream `bottled-gemini` repo has no licence file, so the patched capsule should stay in a private repo unless the owner decides otherwise.

## Environment

What this template needs INSTALLED, beyond what the template already has.
Declared in `template.toml`'s `[environment]` table; an adopting agent
converges it at ITS OWN pinned apt snapshot timestamp, so package versions come
out consistent with the rest of that agent's environment rather than frozen to
whatever this publisher happened to have.

Nothing extra -- runs on the stock workspace environment. The skill uses `git`, `curl`, `openssl` (the server tests generate certificates) and `node` 18 or newer (Node 24 is in the stock workspace), all of which are already present. The capsule's own container gets `nodejs` from the patched `Dockerfile`, not from this workspace.

## How to adapt it

Instructions for the NEXT agent -- the one adapting this template into a
new agent. This is the `use-template` skill's template path; in short:

1. Read this entire file first, especially "Requirements" below. It holds two
   kinds of entry and they are handled at different times: the machine-readable
   `requires_` lines are ACTIVATION (set them up before anything runs), and
   the prose bullets are ADAPTATION (decide or rewire them afterwards).
2. Present the template to the user in plain, non-technical language: what
   it is, what it does, and what it needs from them (name the activation
   requirements).
3. Ask whether they want to use the same connectors (e.g. their own Slack).
   If YES: ACTIVATE FIRST -- initiate every `requires_permission` line NOW
   via a latchkey permission request (see the `connect-external-service` skill; the request
   opens the approval/login flow in the Imbue Studio app), wire up any
   `requires_secret` values, start the services, and get the app showing
   THE USER'S OWN DATA. Done for a data-backed app means the user can open it
   and see their own data -- NOT that a service starts or an endpoint returns
   200. Then tell them it is live and to take a look.
4. Only AFTER that (or immediately, if they chose different connectors -- the
   swap is then the first adaptation) ask: "How do you want to adapt it?"
5. Work through each requirement interactively, one at a time. Translate each
   into plain language, ask for a decision only when you genuinely need one,
   and resolve the obvious ones yourself.
6. When done, append a dated entry to "Adaptation history" below (never
   rewrite earlier entries) and commit.

## Publication history

This template's changelog: what each published version changed. The PUBLISHER
appends one entry per version (newest last); earlier entries are never rewritten.
This is distinct from "Adaptation history" below, which is the ADOPTERS' log.

### v1 (2026-11-24) -- first publication: the skill with the Splendor game source, its tests and the capsule patch, with the game's wording left as `[BOWEI: ...]` placeholders

## Adaptation history

Each agent that adapts this template appends one dated entry below. Earlier
entries are never rewritten.
