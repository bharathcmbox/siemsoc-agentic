# Entity resolution: who is this?

A security platform takes in logs from many systems. Each one names the same laptop and the same person in its own way:

- **The firewall** sees `10.20.4.17`.
- **The DHCP server** sees `10.20.4.17 → 3c:22:fb:91:0a:7e (ws-114)`.
- **The sign-in service** sees `jlee@corp.example`.
- **The endpoint sensor** sees sensor ID `7f3a9c21`, device `WS-114` and user `CORP\jlee`.

**Entity resolution** works out that these all describe one laptop and one person. Every alert, risk score and investigation depends on it. If the platform thinks one laptop is three, each third can look harmless.

This page answers four questions in vendor-neutral terms. The hands-on version is the [Entity Resolution Lab](https://bharathcmbox.github.io/siemsoc-agentic/entities.html) (`entities.html`). Its points and thresholds are in [assumptions.md §7b](assumptions.md). All names, addresses and numbers are fictional or illustrative.

## Strong and weak identifiers

Two kinds of identifier, and the difference matters more than anything else on this page:

| Kind | Examples | Rule |
|---|---|---|
| **Strong**: unique and stable | Sensor ID, hardware (MAC) address, serial number, asset tag, cloud instance ID, directory object ID, employee ID | Can link two records on its own |
| **Weak**: reused or renamed | IP address, short device name, display name, sometimes email (aliases, renames) | Only counts within a time window, or alongside other evidence |

## 1. The basic ways to connect logs from different systems

| Technique | What it does |
|---|---|
| **Common field names** | Every source gets a parser that maps its fields onto one shared schema: source address, destination address, device name, user. A rule written once then works on every source. Fields that don't fit are kept under their own names. |
| **Canonicalizing values** | Write each value the same way everywhere. `CORP\jlee`, `jlee@corp.example` and `JLEE` become one account. Device names are lower-cased, short names are matched to full names, and hardware addresses get one format. |
| **Joining on strong identifiers** | The same sensor ID, or the same employee ID, means the same entity. When a trusted source lists two values together (the asset inventory lists a hardware address for an asset tag), they belong together. |
| **Bridge logs, within a time window** | Some logs exist mainly to connect weak identifiers to strong ones at a moment in time. DHCP ties address → hardware address → device name. DNS ties address ↔ name. VPN and sign-in logs tie address → user and device → user. A link holds only while it was true: an address belongs to a device only for the length of its lease. |
| **Context from systems of record** | Asset inventories, the people directory and HR data supply owner, department, criticality and employment status. Stored as a context graph, or as lookup tables. |
| **Relationships, not merges** | A person and a laptop are different entities. "Jordan Lee uses this laptop" is a relationship between two entities. Merging them would be a mistake. |
| **Correlating by entity, time and sequence** | Once events share entity keys, rules can group them ("same device, within 10 minutes"), follow sequences, or add up risk per entity. |

**The endpoint sensor is the best bridge.** A first-party sensor knows its own device name, addresses, hardware address and signed-in user in real time. That makes it the most reliable address-to-device-to-user table there is. Third-party logs that only carry an address (firewall, DNS, proxy) are tied to devices through it. Sensors can also reveal unmanaged devices from what they see nearby, such as their ARP tables and DNS caches.

## 2. Logs in a format you've never seen

### Where it happens: the ingest pipeline

Before any field can be worked out, the platform has to hold on to data it can't read yet, without losing it, and without letting it mislead detections. A typical pipeline has two paths:

```
Known format:
  Collect → Land → Match a parser ─(parser found)→ Parse → Normalize → Enrich → Store & detect
                        │                            │
                   (no parser)                 (can't parse)
  ┌─────────────────────┴────────────────────────────┘
  ▼
Unknown format:
  Fingerprint → Staging → Propose mapping → Shadow test → Approve → Replay ─(re-run)→ Match a parser
```

| Stage | What happens | Why it's built this way |
|---|---|---|
| **Collect** | Agents, syslog listeners, API pollers and HTTPS endpoints receive lines and wrap each in an envelope: arrival time, connection, declared log type. The line itself is unchanged. | The connection is the most reliable clue to a format, so each source gets its own. |
| **Land** | The line is written to a durable queue and a raw archive before any parsing. | Write before you parse: a missing or broken parser loses nothing, and any later stage can be replayed. |
| **Match a parser** | By the connection's declared type, then by matching the line's shape against templates each parser accepts. | Matching on shape catches format drift, and two kinds of log on one connection. |
| **Parse → Normalize → Enrich → Store** | A versioned parser splits the line; fields get common names; entities are resolved; the event is routed to searchable or cheap storage. | Failures are counted per parser: a rising rate is the early warning of drift. |
| **Fingerprint** | Finds the format and where each event ends, then masks values to get a template, the line's shape. Lines are grouped by template. | You map a few shapes, not millions of lines. A new template on a known connection signals drift. |
| **Staging** | Lines are kept with their envelope, template and raw keys and values. They are searchable as text and swept for known-bad values, but don't feed entity linking or detection rules. The arrival time stands in for the event time, marked as such. | Unknown is neither dropped nor trusted. Staging has its own retention and tighter access: unknown data can hold secrets. |
| **Propose mapping** | Field clues are scored (below), and an AI assistant may draft the parser. The output is a candidate, not live. | The assistant treats log text as data, never as instructions. |
| **Shadow test** | The candidate runs on the staged lines, and its output is checked but not used: parse rate, required fields, types, entity match rate, direction. A new version must also read old lines exactly as before. | Test on the real sample, where the odd cases are. |
| **Approve** | A person approves; the parser is registered with a version, an owner and the templates it accepts. | Parsers are code: owned, versioned, and possible to roll back. |
| **Replay** | Staged lines go back through "Match a parser". Each keeps its connection and queue position, so none is stored twice. Event times are corrected. | Late detections then carry the right time. |

**Format drift is the common case.** A firmware update that adds a field to a firewall's lines happens far more often than a brand-new source, and it is quieter: data keeps arriving, it just stops making sense. The parse-failure rate is how you notice.

### Working out what the fields mean

The process runs from cheap and certain to expensive and uncertain:

1. **Find the format.** Try JSON, XML, comma-separated, syslog, CEF-style and key=value, and pick the one that splits every line the same way.
2. **Extract fields without meaning.** Pull out every key and value. Structured formats (JSON, XML) can be extracted automatically.
3. **Score three clues for each field:**
   - **Name:** does the field name match names other sources use (`src_ip`, `sourceAddress`, `client_ip`, `cip`)?
   - **Shape:** do the values look like an address, a domain, an account, a time, a hardware address?
   - **Seen before:** do the values match things you already hold? This is the strongest clue. If every value is a device name you already know, the field holds device names, whatever it is called.
4. **Work out the role as well as the type.** Two address fields could be source and destination. Clues: which one changes with each device, which values are inside your network, which ports go with which address.
5. **Use thresholds.** High confidence: use the meaning now and list it for review. Middle: a person checks first. Low: keep the field under its own name.
6. **AI can draft, a person approves.** An AI assistant can propose a parser from sample lines and a plain description. The log text comes from systems outsiders can write to, so the assistant must treat it as data, never as instructions. See [What AI agents can get wrong](ai-risks.md).
7. **Keep the raw line.** A wrong mapping can be fixed later. A field that was thrown away can't.

**When meanings are applied matters.** If they are applied when logs are stored, searches are fast, but a fix only helps new logs. If they are applied when you search, a fix applies to all history, at the cost of slower searches.

## 3. A known entity, or a new one?

The classic record-linkage pipeline:

1. **Canonicalize** each identifier in the new record.
2. **Find candidates.** Look up entities that share any identifier, through an index. Never compare against everything.
3. **Score each candidate.** Add points for each agreeing identifier, weighted by strength. Weak identifiers count only if they were valid at the event's time.
4. **Check for conflicts.**
   - Two different strong identifiers of the same kind point to different entities, even when the names match.
   - If both are reporting at the same time, it can't be a match.
   - If the old one went silent, it could be a reimage of the same device, or a new device that got the old name.
5. **Decide with two thresholds:**
   - Above the upper one: link automatically.
   - Between the two: hold as a likely match and ask a person.
   - Below the lower one: create a new entity.
   - If two candidates score about the same, don't guess: ask a person.

Two traps to design against:

- **Hairballs.** One shared value can chain thousands of entities together through repeated joins: an office's shared internet address, a proxy, a service account, a placeholder name like `localhost`. Fixes:
  - keep a deny list of shared values;
  - cap how many entities one value may link;
  - never link on a weak identifier alone.
- **Time.** Links without a time range are a bug. Context graphs store each link with when it was true, and look back a few days so late-arriving logs still get linked.

**New entities aren't failures.** A device that matches nothing may be an unmanaged device nobody installed a sensor on, which is a useful finding in its own right.

## 4. The platform said "new", but a person says "that's the same one"

A person's tag is the strongest evidence the platform has. A well-built platform does five things:

1. **Records the tag as a fact, not a rewrite.**
   - Stores a "must-link" with who, when and why.
   - Keeps it separate from the matcher's own results, so it can be undone and so the matcher can never quietly overrule it.
   - Handles the opposite tag, "cannot-link", the same way, to split a wrong match.
2. **Merges, keeping the old ID as an alias.**
   - One entity survives, usually the older one or the one with the strongest identifiers.
   - The other ID points to it, so every case, report and link that mentions it still works.
3. **Re-files the history.**
   - If names are looked up when you search, updating the entity table re-files all history at once.
   - If names were added when events were stored, old events keep the old ID. Searches reach them through the alias table until a backfill rewrites them.
4. **Recomputes everything worked out per entity:**
   - risk scores and behavior baselines;
   - open cases (two low-priority cases may now be one incident);
   - **counting rules.** "5 failed sign-ins on one device within 60 minutes" may have been true all along, split across two IDs. Re-run recent windows, and raise the alert now, dated when it happened.
5. **Learns from the correction.**
   - Why did the matcher miss it? Was a bridge source missing (no device-management or DHCP feed)? Was an identifier not canonicalized? Was a threshold too high?
   - Adjust the matcher, then look for the same pattern elsewhere and send those pairs for review.

## Patterns you'll find in real platforms

Products package these ideas differently, but the building blocks are the same:

- **A common schema** for all sources, with unmapped fields kept.
- **The first-party sensor** as the bridge for third-party logs that only carry addresses.
- **A context graph** with time-bounded links and a lookback window for late data.
- **Ranked sources of truth** decide which source wins when they disagree.
- **Search-time lookups** make corrections apply to all history at once.
- **Context added when stored** makes searches fast, but corrections then need a backfill or an alias table.
- **AI-drafted parsers**, reviewed by a person before they are switched on.
- **Deny lists** keep shared values out of matching.
