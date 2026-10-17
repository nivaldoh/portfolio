#!/usr/bin/env python3
"""Export one recorded Total War: WARHAMMER III battle as compact JSON for the portfolio.

Provenance
----------
The source is one episode directory written by the game-agents harness
(github.com/nivaldoh/slay_the_spire_ai, ``runs/twwarhammer3/battle/<job>/episode-NNNN``):

- ``trace.jsonl``  the controller's observations (the exact state each model reply was
  based on), the model's decisions and the game's acknowledgements;
- ``replay.jsonl`` the 1 Hz presentation recorder written by the battle script;
- ``result.json`` and the job's ``manifest.json`` for the outcome and settings;
- the curated ``configs/twwarhammer3/report_notes.json`` for unit names and analyst notes.

This script only reads those recorded files. It runs no game, model or network call and
writes nothing except the output file. It mirrors the rules of the repository's offline
report (``src/twwarhammer3/battle/replay.py`` and ``report_assets/replay.js``):

- Samples are the recorder frames plus the decision-basis observations, sorted by battle
  time. Where both exist at the same battle time the observation is kept (the report shows
  that one too); a repeated recorder time keeps the later (terminal) frame. Positions are
  never interpolated: a missing unit is ``null``.
- Coordinates are the game's metres: ``x`` grows east, ``z`` grows north. Draw north up
  (screen y = -z), as the report does.
- Enemy units appear in a sample only while visible to the model's army: the recorder and
  the controller apply the same engine visibility test (line of sight and not hidden).
  ``null`` for an enemy therefore means "not visible or destroyed", never "not there".
- A decision's ``t`` is when the game accepted (acknowledged) the reply, ``obs_t`` the
  battle time of the observation the model was given. The model's view at playback time T
  is the observation behind the latest reply with ``t <= T`` (empty replies included);
  its age is ``T - obs_t``.

Usage::

    python3 scripts/export_wh3_replay.py JOB/episode-0000 report_notes.json out.json \\
        [--clip START END]

``--clip`` adds an extra recorded window (for example the README animation's).
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path

ERRORS = {"unreachable": "destination unreachable", "unit_routing": "unit is fleeing",
          "queue_predecessor_failed_or_missing": "the step before it failed or was missing"}
COMPASS = ("north", "north-east", "east", "south-east", "south", "south-west", "west",
           "north-west")
SMALL_WORDS = {"a", "an", "and", "at", "for", "in", "of", "on", "the", "to"}
GLYPHS = {"lord": "general", "hero": "general", "cavalry": "cavalry",
          "missile_cavalry": "missile_cavalry", "infantry": "infantry",
          "missile": "missile_infantry", "artillery": "artillery", "monster": "monster"}
MELEE, FLEEING = 1, 2


def records(path: Path):
    """(line number, record) for every readable JSON object line."""
    if not path.exists():
        return
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            value = json.loads(line)
        except ValueError:
            continue
        if isinstance(value, dict):
            yield number, value


def title(text: str) -> str:
    return " ".join(word if index and word in SMALL_WORDS else word[:1].upper() + word[1:]
                    for index, word in enumerate(text.replace("_", " ").split()))


def fallback_name(unit_type: str) -> str:
    short = re.sub(r"^wh\d?_[a-z0-9]+_[a-z]{3}_[a-z]{3}_", "", unit_type or "?")
    return title(re.sub(r"_\d+$", "", short))


def ability_name(key) -> str:
    key = str(key or "?")
    return title(key.rsplit("abilities_", 1)[1] if "abilities_" in key
                 else re.sub(r"^wh\d?_[a-z0-9]+_(?:spell_[a-z]+_)?", "", key))


def error_text(code) -> str:
    code = str(code or "unknown")
    wrapped = re.search(r"\(error: (.+)\)$", code)
    if wrapped:
        code = re.sub(r"unit '\d+' ", "unit ", wrapped[1])
    return ERRORS.get(code, code.replace("_", " "))


def r1(value):
    return None if value is None else round(float(value), 1)


def js_round(value: float) -> int:
    return math.floor(value + 0.5)


def step_text(order: dict, origin, labels: dict) -> str:
    """One order in plain words, as the report words it (moves: distance and compass)."""
    kind, target = order.get("type"), labels.get(order.get("target"), order.get("target"))
    if kind == "move":
        if origin is None:
            return f"move to ({order['x']:.0f}, {order['z']:.0f})"
        dx, dz = order["x"] - origin[0], order["z"] - origin[1]
        verb, metres = "run" if order.get("run") else "walk", round(math.hypot(dx, dz) / 10) * 10
        if not metres:
            return f"{verb} less than 10 m"
        return f"{verb} {metres} m {COMPASS[round(math.degrees(math.atan2(dx, dz)) / 45) % 8]}"
    if kind == "attack":
        mode = order.get("mode")
        return (f"attack {target} in melee" if mode == "melee"
                else f"shoot at {target}" if mode == "ranged" else f"attack {target}")
    if kind == "behaviour":
        behaviour = str(order.get("behaviour")).removeprefix("change_").replace("_", " ")
        return f"turn {behaviour} {'on' if order.get('enabled') else 'off'}"
    if kind == "ability":
        text = f"use {ability_name(order.get('ability'))}"
        if target:
            return f"{text} on {target}"
        return text + (f" at ({order['x']:.0f}, {order['z']:.0f})"
                       if order.get("x") is not None and order.get("z") is not None else "")
    if kind == "flight":
        return "take off" if order.get("flying") else "land"
    if kind == "halt":
        return "halt"
    return str(kind)


def load(episode: Path):
    """Frames keyed like the report: (time_ms, seq) for observations, (time_ms, -1) for
    recorder frames; decisions with their acknowledgements."""
    frames, decisions, by_request, battle, job, terrain, pending_invalid = {}, [], {}, None, None, None, None
    for line, record in records(episode / "trace.jsonl"):
        obs = record.get("observation")
        if isinstance(obs, dict) and obs.get("time_ms") is not None:
            battle, job = obs.get("battle", battle), obs.get("job", job)
            terrain = obs.get("terrain") or terrain
            frames[(obs["time_ms"], obs.get("seq"))] = {"obs": obs, "src": f"trace.jsonl:{line}"}
        kind = record.get("kind")
        if kind == "invalid":
            pending_invalid = record
        elif kind == "decision":
            behavior = record.get("behavior") or {}
            decision = {"line": line, "request": record.get("request"), "seq": record.get("seq"),
                        "time_ms": record.get("time_ms"),
                        "decision_time_ms": record.get("decision_time_ms"),
                        "behavior": behavior, "orders": [{"order": o, "ack": None}
                                                         for o in record.get("orders") or []],
                        "invalid": pending_invalid, "applied_ms": None, "latency": {}}
            pending_invalid = None
            by_request[record.get("request")] = decision
            decisions.append(decision)
        elif kind == "ack" and record.get("request") in by_request:
            decision = by_request[record["request"]]
            ack = record.get("ack") or {}
            decision.update(applied_ms=ack.get("applied_ms"), latency=record.get("latency") or {},
                            ack_line=line)
            for reply in ack.get("results", []):
                index = reply.get("index", 0) - 1
                if 0 <= index < len(decision["orders"]):
                    decision["orders"][index]["ack"] = reply
    recorder = {}
    for line, record in records(episode / "replay.jsonl"):
        if (record.get("recorder") != 1 or record.get("battle") != battle
                or record.get("job") != job or not isinstance(record.get("time_ms"), (int, float))):
            continue
        recorder[record["time_ms"]] = {"obs": record, "src": f"replay.jsonl:{line}"}
    observed_times = {time for time, _ in frames}
    for time, frame in recorder.items():
        if time not in observed_times:  # at a shared time the report shows the observation
            frames[(time, -1)] = frame
    ordered = [frames[key] for key in sorted(frames, key=lambda k: (k[0], -1 if k[1] is None else k[1]))
               if frames[key]["obs"].get("friendly") or frames[key]["obs"].get("enemy")]
    return ordered, decisions, terrain, len(recorder)


def build(episode: Path, notes: dict, clip=None) -> dict:
    job_dir = episode.parent
    manifest = json.loads((job_dir / "manifest.json").read_text(encoding="utf-8"))
    result = json.loads((episode / "result.json").read_text(encoding="utf-8"))
    frames, decisions, terrain, recorder_frames = load(episode)
    run_key = f"{job_dir.name}/{episode.name}"
    run = (notes.get("runs") or {}).get(run_key) or {}
    unit_notes = notes.get("units") or {}
    scenario = manifest.get("scenario") or {}
    scenario_note = (notes.get("scenarios") or {}).get(scenario.get("name")) or {}
    episode_meta = next((e for e in manifest.get("episodes", []) if e.get("episode") == episode.name), {})
    card = episode_meta.get("card") or {}

    # Roster: every unit any sample lists, friendly first, then by numeric id.
    roster = {}
    for frame in frames:
        obs = frame["obs"]
        for side in ("friendly", "enemy", "enemy_roster"):
            for unit in obs.get(side) or []:
                entry = roster.setdefault(unit["id"], {"id": unit["id"],
                                                       "side": "model" if side == "friendly" else "ai"})
                for key in ("type", "class", "commander", "men0", "name"):
                    if unit.get(key) is not None and key not in entry:
                        entry[key] = unit[key]
    units = sorted(roster.values(), key=lambda e: (e["side"] != "model",
                                                   int(re.sub(r"\D", "", e["id"]) or 0), e["id"]))
    for entry in units:
        note = unit_notes.get(entry.get("type")) or {}
        entry["base"] = note.get("name") or entry.pop("name", None) or fallback_name(entry.get("type"))
        entry.pop("name", None)
        entry.update(role=note.get("role"), about=note.get("about"),
                     glyph=note.get("glyph") or GLYPHS.get(entry.get("class"), "unknown"),
                     short_base=note.get("short") or "".join(w[0] for w in entry["base"].split()
                                                             if w[0].isupper())[:3])
    for entry in units:
        same = [o["id"] for o in units if o["side"] == entry["side"] and o["base"] == entry["base"]]
        number = str(same.index(entry["id"]) + 1) if len(same) > 1 else ""
        entry["name"] = f"{entry['base']} {number}".strip()
        entry["short"] = entry.pop("short_base") + number
    labels = {e["id"]: e["name"] for e in units}

    # Samples.
    times = [r1(f["obs"]["time_ms"] / 1000) for f in frames]
    pos = {e["id"]: [] for e in units}
    dead_at = {}
    single = {e["id"] for e in units if e.get("men0") == 1}
    for frame in frames:
        obs = frame["obs"]
        present = {}
        for side in ("friendly", "enemy"):
            for unit in obs.get(side) or []:
                if unit.get("x") is None or unit.get("z") is None:
                    continue
                state = set(unit.get("state") or [])
                flags = (MELEE if "melee" in state else 0) | (FLEEING if state & {"routing", "shattered"} else 0)
                item = [r1(unit["x"]), r1(unit["z"]), unit.get("men"), flags]
                if unit["id"] in single:
                    item.append(round(unit.get("hp") or 0, 2))
                present[unit["id"]] = item
        for unit in obs.get("enemy_roster") or []:
            if unit.get("dead") is True:
                dead_at.setdefault(unit["id"], r1(obs["time_ms"] / 1000))
        for uid in pos:
            pos[uid].append(present.get(uid))

    index_of_time = {}
    for i, frame in enumerate(frames):
        index_of_time[(frame["obs"]["time_ms"], frame["obs"].get("seq"))] = i

    def first_at_or_after(ms):
        return next((i for i, f in enumerate(frames) if f["obs"]["time_ms"] >= ms), None)

    # Decisions.
    out_decisions, memo = [], None
    for d in decisions:
        behavior = d["behavior"]
        new_memo = behavior.get("notes", memo)
        basis_i = index_of_time.get((d["time_ms"], d["seq"]))
        start = {}
        if basis_i is not None:
            start = {u["id"]: (u["x"], u["z"]) for u in frames[basis_i]["obs"].get("friendly") or []
                     if u.get("x") is not None and u.get("z") is not None}
        waypoint, orders = {}, []
        for item in d["orders"]:
            order, ack = item["order"], item["ack"]
            unit, kind, queued = order.get("unit"), order.get("type"), bool(order.get("queue"))
            status = ("issued; acknowledgement missing" if ack is None else
                      "rejected" if not ack.get("ok") else "queued" if ack.get("queued")
                      else "acknowledged")
            entry = {"unit": labels.get(unit, "Army" if unit == "army" else unit), "unitId": unit,
                     "kind": kind,
                     "action": step_text(order, waypoint.get(unit) if queued else start.get(unit),
                                         labels),
                     "status": status}
            if queued:
                entry["queued"] = True
            if status == "rejected":
                entry["error"] = error_text(ack.get("error"))
            if kind == "move":
                entry["to"] = [r1(order.get("x")), r1(order.get("z"))]
                entry["run"] = bool(order.get("run"))
            if order.get("target"):
                entry["target"] = order["target"]
            if kind == "ability":
                entry["ability"] = ability_name(order.get("ability"))
                if order.get("x") is not None and order.get("z") is not None:
                    entry["at"] = [r1(order["x"]), r1(order["z"])]
            if kind in ("move", "attack", "halt"):
                waypoint[unit] = (order["x"], order["z"]) if kind == "move" else None
            orders.append(entry)
        applied = d["applied_ms"]
        decision = {"obs_t": r1(d["time_ms"] / 1000), "obs_i": basis_i,
                    "t": None if applied is None else r1(applied / 1000),
                    "after_i": None if applied is None else first_at_or_after(applied),
                    "age_s": None if applied is None else r1((applied - d["time_ms"]) / 1000),
                    "think_s": r1(d["latency"].get("think_s")),
                    "reply": behavior.get("reason"),
                    "orders": orders,
                    "source": f"trace.jsonl:{d['line']}" + (f", ack trace.jsonl:{d['ack_line']}"
                                                            if d.get("ack_line") else "")}
        if new_memo != memo and new_memo is not None:
            decision["memo"] = new_memo  # the model's own battle notes, rewritten in this reply
        memo = new_memo
        if d["decision_time_ms"] is not None and d["decision_time_ms"] != d["time_ms"]:
            decision["ask_t"] = r1(d["decision_time_ms"] / 1000)
        retries = [a.get("error") for a in behavior.get("attempts") or [] if a.get("error")]
        if retries:
            decision["reasked_after"] = retries
        if d["invalid"]:
            decision["refused"] = {"error": d["invalid"].get("error"),
                                   "orders": len(d["invalid"].get("orders") or [])}
        out_decisions.append(decision)

    # Factual state events from the samples, as the report derives them.
    events, contact, previous = [], False, None
    for i, frame in enumerate(frames):
        obs = frame["obs"]
        now = {u["id"]: u for side in ("friendly", "enemy") for u in obs.get(side) or []}
        if previous is not None:
            for uid, unit in now.items():
                before = previous.get(uid)
                states, prior = unit.get("state"), (before or {}).get("state")
                if states is not None and prior is not None:
                    if "melee" in states and "melee" not in prior and not contact:
                        events.append({"t": times[i], "kind": "contact", "unit": uid,
                                       "text": f"First melee: {labels.get(uid, uid)}"})
                        contact = True
                    if "routing" in states and "routing" not in prior:
                        events.append({"t": times[i], "kind": "rout", "unit": uid,
                                       "text": f"{labels.get(uid, uid)} began fleeing"})
                    if ("routing" in prior and "routing" not in states
                            and "shattered" not in states and unit.get("men", 0) > 0):
                        events.append({"t": times[i], "kind": "rally", "unit": uid,
                                       "text": f"{labels.get(uid, uid)} rallied"})
        previous = now
    for uid, t in dead_at.items():
        events.append({"t": t, "kind": "death", "unit": uid,
                       "text": f"{labels.get(uid, uid)} destroyed (seen)"})
    for e in units:
        if e["side"] == "model":
            series = pos[e["id"]]
            for i in range(1, len(series)):
                if series[i] and series[i - 1] and series[i - 1][2] > 0 and series[i][2] == 0:
                    events.append({"t": times[i], "kind": "death", "unit": e["id"],
                                   "text": f"{e['name']} destroyed"})
                    break
    events.append({"t": times[-1], "kind": "end",
                   "text": f"Battle ended: {result.get('status')}"})
    events.sort(key=lambda e: e["t"])

    # The report's fixed framing: 5th-95th percentile of every recorded position plus the
    # units' first positions in the first 30 s, with a 50 m margin and at least 220 m.
    tracks = {}
    for i, frame in enumerate(frames):
        for side in ("friendly", "enemy"):
            for unit in frame["obs"].get(side) or []:
                if unit.get("x") is None or unit.get("z") is None:
                    continue
                track = tracks.setdefault(unit["id"], [])
                if not track or track[-1][0] != frame["obs"]["time_ms"]:
                    track.append((frame["obs"]["time_ms"], unit["x"], unit["z"]))
    every = [p for track in tracks.values() for p in track]
    xs, zs = sorted(p[1] for p in every), sorted(p[2] for p in every)
    pick = lambda values, q: values[js_round((len(values) - 1) * q)]
    start_ms = frames[0]["obs"]["time_ms"]
    points = [(pick(xs, .05), pick(zs, .05)), (pick(xs, .95), pick(zs, .95))]
    points += [(t[0][1], t[0][2]) for t in tracks.values() if t[0][0] <= start_ms + 30000]
    box = [min(p[0] for p in points), min(p[1] for p in points),
           max(p[0] for p in points), max(p[1] for p in points)]
    for a, b in ((0, 2), (1, 3)):
        grow = max(50, (220 - (box[b] - box[a])) / 2)
        box[a] -= grow
        box[b] += grow

    highlights = run.get("highlights") or []
    featured = next((h for h in highlights if h.get("feature")), highlights[0] if highlights else None)
    gaps = [b - a for a, b in zip(times, times[1:])]
    data = {
        "schema": 1,
        "meta": {
            "scenario_id": scenario.get("name"),
            "scenario_title": scenario_note.get("title"),
            "heading": scenario_note.get("heading"),
            "challenge": scenario_note.get("challenge"),
            "model": card.get("model") or (manifest.get("config") or {}).get("model"),
            "effort": card.get("effort"),
            "controller": episode_meta.get("policy"),
            "prompt": {"llm": "prompt with tactical tips", "llm_rules": "rules-only prompt"}.get(
                episode_meta.get("policy")),
            "outcome": result.get("status"),
            "battle_s": r1((result.get("battle_ms") or episode_meta.get("battle_ms")) / 1000),
            "time_limit_s": (scenario.get("expect") or {}).get("time_limit_s"),
            "enemy_ai": (scenario.get("expect") or {}).get("difficulty"),
            "ai_stats_modifier": (scenario.get("expect") or {}).get("ai_stats_modifier"),
            "game_speed": "unpaused, 1x (the battle kept running while the model replied)",
            "decisions": len(out_decisions),
            "source": run_key,
            "source_revision": manifest.get("source_revision"),
            "recorded_on": (episode_meta.get("started_at") or manifest.get("created_at") or "")[:10],
            "exported_by": "scripts/export_wh3_replay.py (reads recorded files only)",
        },
        "semantics": {
            "coordinates": "metres; x grows east, z grows north; draw north up (screen y = -z)",
            "samples": f"{recorder_frames} recorder frames (about 1 per battle second) merged with "
                       "the decision-basis observations; positions never interpolated",
            "pos": "per unit, one entry per sample: [x, z, men, flags] (+ hp 0-1 for single-figure "
                   "units) or null; flags: 1 = in melee, 2 = fleeing (routing or shattered)",
            "enemy_visibility": "an enemy entry exists only while the unit was visible to the "
                                "model's army; null = not visible or destroyed",
            "model_view": "at playback time T, the observation behind the latest decision with "
                          "t <= T (empty replies included): samples[obs_i], age T - obs_t",
            "decision_t": "t = battle time the game acknowledged the reply's orders; obs_t = battle "
                          "time of the observation the model was given",
            "orders": "issued orders and their acknowledgement; acknowledged is not proof the order "
                      "was carried out. Issued routes ('to') are distinct from observed movement",
            "reply": "the model's stated reason from its structured reply, verbatim; not access to "
                     "hidden reasoning. It names units by raw id (f1 = model, e1 = AI); see units",
            "memo": "present when the reply rewrote the model's own battle notes (its memory "
                    "between replies), verbatim",
            "notes": "analyst interpretations drafted after the battle with AI assistance and "
                     "checked against the recorded events; not the model's words",
        },
        "bounds": {"xmin": r1(box[0]), "xmax": r1(box[2]), "zmin": r1(box[1]), "zmax": r1(box[3]),
                   "basis": "the report's framing: 5th-95th percentile of recorded positions and "
                            "starting positions, 50 m margin"},
        "terrain": None if not terrain else {
            "cell_m": terrain.get("cell_m"), "x0": terrain.get("x0"), "z0": terrain.get("z0"),
            "sample_width_m": terrain.get("sample_width_m"), "rows": terrain.get("rows"),
            "bounds": terrain.get("bounds"),
            "about": "rows[j][i] is the cell centred at (x0 + i*cell_m, z0 + j*cell_m); row 0 is "
                     "the southern edge. '#' = a sample_width_m square failed the engine's "
                     "is_area_clear test at deployment (restricted), '.' = clear. Coarse, not a "
                     "path planner"},
        "units": [{k: e.get(k) for k in ("id", "side", "name", "short", "class", "role", "glyph",
                                         "men0", "commander", "about")} for e in units],
        "t": times,
        "pos": pos,
        "dead_t": dead_at,
        "decisions": out_decisions,
        "events": events,
        "notes": [{"t": r1(h["time_ms"] / 1000), "start": r1(max(0, h["time_ms"] / 1000 - (h.get("lead_in_s") or 0))),
                   "end": r1(h["end_ms"] / 1000) if h.get("end_ms") is not None else None,
                   "title": h.get("title"), "text": h.get("text"), "units": h.get("units"),
                   "kind": h.get("kind"), "feature": bool(h.get("feature")),
                   "label": "Analyst note (interpretation, written after the battle)"}
                  for h in highlights],
        "key_moment": None if not featured else {
            "start": r1(max(0, featured["time_ms"] / 1000 - (featured.get("lead_in_s") or 0))),
            "at": r1(featured["time_ms"] / 1000),
            "end": r1(featured["end_ms"] / 1000) if featured.get("end_ms") is not None else None,
            "title": featured.get("title"),
            "basis": "the report's 'Play key moment': the featured analyst note with its lead-in"},
        "stats": {"samples": len(times), "max_gap_s": r1(max(gaps)) if gaps else None},
    }
    if clip:
        data["clip"] = {"start": clip[0], "end": clip[1]}
    return data


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("episode", type=Path, help="job/episode-NNNN directory")
    parser.add_argument("notes", type=Path, help="configs/twwarhammer3/report_notes.json")
    parser.add_argument("output", type=Path)
    parser.add_argument("--clip", type=float, nargs=2, metavar=("START", "END"))
    args = parser.parse_args(argv)
    notes = json.loads(args.notes.read_text(encoding="utf-8"))
    data = build(args.episode.resolve(), notes, args.clip)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {args.output} ({len(text.encode('utf-8')):,} bytes, {len(data['t'])} samples, "
          f"{len(data['decisions'])} decisions)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
