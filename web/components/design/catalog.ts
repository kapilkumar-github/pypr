import {
  Activity,
  Boxes,
  ChartLine,
  Cloud,
  Cog,
  Database,
  FileText,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  ListOrdered,
  Monitor,
  Plug,
  Radio,
  Router,
  Search,
  Server,
  Shield,
  Smartphone,
  Split,
  Timer,
  Waypoints,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react"

export type ShapeKind = "rectangle" | "rounded" | "ellipse" | "diamond" | "cylinder" | "cloud" | "hexagon" | "note" | "group"

export const SHAPES: { id: ShapeKind; name: string }[] = [
  { id: "rectangle", name: "Rectangle" },
  { id: "rounded", name: "Rounded" },
  { id: "ellipse", name: "Ellipse" },
  { id: "diamond", name: "Diamond" },
  { id: "cylinder", name: "Cylinder" },
  { id: "cloud", name: "Cloud" },
  { id: "hexagon", name: "Hexagon" },
  { id: "note", name: "Note" },
]

/** What a node stores. Everything but `kind` and `label` is optional so old boards keep opening. */
export type NodeData = {
  kind: string
  label: string
  /** What this component does in the design, in the learner's words. The interviewer reads it when evaluating. */
  role?: string
  shape?: ShapeKind
  fill?: string
  stroke?: string
  fontSize?: number
}

export type PaletteGroup = "Shapes" | "Edge and network" | "Compute" | "Data" | "Messaging" | "Platform"

export type PaletteItem = {
  kind: string
  label: string
  group: PaletteGroup
  shape: ShapeKind
  icon?: LucideIcon
  /** Starting size. */
  w: number
  h: number
  /** Tint for component nodes. */
  accent?: string
  /** Shown on hover in the toolbox: what it is and when to reach for it. */
  info?: { what: string; use: string }
}

const shape = (kind: string, label: string, s: ShapeKind, w = 140, h = 80): PaletteItem => ({ kind, label, group: "Shapes", shape: s, w, h })
const part = (group: PaletteGroup, kind: string, label: string, icon: LucideIcon, accent: string, s: ShapeKind = "rounded"): PaletteItem => ({
  kind,
  label,
  group,
  shape: s,
  icon,
  w: 150,
  h: 76,
  accent,
})

const RAW_PALETTE: PaletteItem[] = [
  shape("rectangle", "Rectangle", "rectangle"),
  shape("rounded", "Rounded box", "rounded"),
  shape("ellipse", "Ellipse", "ellipse"),
  shape("diamond", "Decision", "diamond", 130, 110),
  shape("cylinder", "Cylinder", "cylinder", 110, 110),
  shape("cloud", "Cloud", "cloud", 170, 100),
  shape("hexagon", "Hexagon", "hexagon", 150, 90),
  shape("note", "Note", "note", 160, 90),
  { kind: "group", label: "Group", group: "Shapes", shape: "group", w: 360, h: 240 },

  part("Edge and network", "client", "Web client", Monitor, "#3b82f6"),
  part("Edge and network", "mobile", "Mobile app", Smartphone, "#3b82f6"),
  part("Edge and network", "dns", "DNS", Globe, "#64748b"),
  part("Edge and network", "cdn", "CDN", Cloud, "#0ea5e9"),
  part("Edge and network", "loadbalancer", "Load balancer", Split, "#14b8a6"),
  part("Edge and network", "gateway", "API gateway", Router, "#14b8a6"),
  part("Edge and network", "proxy", "Reverse proxy", Waypoints, "#14b8a6"),
  part("Edge and network", "firewall", "Firewall", Shield, "#ef4444"),

  part("Compute", "server", "Server", Server, "#22c55e"),
  part("Compute", "service", "Service", Boxes, "#22c55e"),
  part("Compute", "worker", "Worker", Cog, "#22c55e"),
  part("Compute", "scheduler", "Scheduler / cron", Timer, "#22c55e"),
  part("Compute", "auth", "Auth service", KeyRound, "#f59e0b"),
  part("Compute", "ratelimiter", "Rate limiter", Gauge, "#f59e0b"),
  part("Compute", "thirdparty", "Third-party API", Plug, "#64748b"),

  part("Data", "sqldb", "SQL database", Database, "#a855f7", "cylinder"),
  part("Data", "nosql", "NoSQL database", Layers, "#a855f7", "cylinder"),
  part("Data", "cache", "Cache (Redis)", Zap, "#ef4444"),
  part("Data", "storage", "Object storage", HardDrive, "#a855f7"),
  part("Data", "search", "Search index", Search, "#a855f7"),

  part("Messaging", "queue", "Message queue", ListOrdered, "#f59e0b"),
  part("Messaging", "stream", "Event stream (Kafka)", Activity, "#f59e0b"),
  part("Messaging", "pubsub", "Pub/Sub topic", Radio, "#f59e0b"),
  part("Messaging", "flink", "Flink", Workflow, "#f59e0b"),

  part("Platform", "monitoring", "Monitoring", ChartLine, "#64748b"),
  part("Platform", "logging", "Logging", FileText, "#64748b"),
]

const i = (what: string, use: string) => ({ what, use })

/** Hover cards for the toolbox. Kept apart from the list so the list stays easy to scan. */
const INFO: Record<string, PaletteItem["info"]> = {
  rectangle: i("A plain box.", "Anything that has no better shape: a team, a module, a label."),
  rounded: i("A box with soft corners.", "A generic service or step when no specific component fits."),
  ellipse: i("An oval.", "A start or end point, an actor, or a user."),
  diamond: i("A decision.", "A branch: cache hit or miss, valid or invalid, retry or give up."),
  cylinder: i("The classic database symbol.", "Any store of data when you do not need to say which kind."),
  cloud: i("A cloud.", "The internet, a region, or an external system you do not own."),
  hexagon: i("A six-sided shape.", "A grouped capability, such as a platform or a bounded context."),
  note: i("A sticky note on the canvas.", "Assumptions, numbers and reminders next to the part they explain."),
  group: i("A resizable container that sits behind other items.", "Box related parts together: a region, a VPC, a subnet or a team's services."),
  client: i("A browser or desktop app that calls your system.", "The start of most request flows. Mark what it calls first."),
  mobile: i("A phone app. It has flaky networks, battery limits and old versions in the wild.", "Show push notifications, offline mode or API versioning."),
  dns: i("Turns a name into an IP address, and can steer users to the nearest region.", "Geo routing, failover between regions, the first hop of a request."),
  cdn: i("Edge servers that cache static files close to users.", "Images, video, JS and CSS. Cuts latency and takes load off origin servers."),
  loadbalancer: i("Spreads requests across many servers and drops unhealthy ones.", "In front of any group of stateless servers. Say if it works at layer 4 or 7."),
  gateway: i("The single front door for APIs: auth, rate limits, routing, request shaping.", "Between clients and many back-end services, especially microservices."),
  proxy: i("Sits in front of servers, hiding them and handling TLS, compression and caching.", "TLS termination, caching static replies, hiding internal servers."),
  firewall: i("Blocks traffic by rule.", "The edge of a private network, or protection from abuse and attacks."),
  server: i("A machine or container that runs your application code.", "Stateless app servers behind a load balancer. Scale out by adding more."),
  service: i("One deployable unit that owns one job and its data.", "A microservice boundary: users, orders, payments. Draw who calls it."),
  worker: i("A background process that takes jobs from a queue.", "Slow or retryable work: emails, image resizing, report generation."),
  scheduler: i("Runs jobs on a timetable.", "Nightly reports, cleanups, retries of stuck work. Say how it avoids running twice."),
  auth: i("Checks who a caller is and what they may do.", "Login, tokens, OAuth, roles. Say where tokens are verified."),
  ratelimiter: i("Caps how many requests a caller may make.", "Protect APIs from abuse and noisy neighbours. Say the key, the limit and where state lives."),
  thirdparty: i("A system you do not run, such as a payment provider or a maps API.", "Show timeouts, retries and what happens when it is down."),
  sqldb: i("A relational database with tables, joins and transactions.", "Money, orders and anything needing strong consistency. Mention indexes, replicas and sharding."),
  nosql: i("A key-value, document or wide-column store that scales out easily.", "Huge write volume, flexible schemas, simple access by key."),
  cache: i("An in-memory store (Redis, Memcached) that answers in under a millisecond.", "Hot reads in front of a database. Say the eviction policy, the TTL and how it is invalidated."),
  storage: i("Cheap, durable storage for large files (S3-style).", "Images, video, backups and logs. Serve them through a CDN."),
  search: i("An index built for text search and filters (Elasticsearch-style).", "Search boxes, autocomplete, log search. It is fed from the main database, not the source of truth."),
  queue: i("Holds messages until a consumer takes them.", "Decouple a fast producer from slow work, smooth traffic spikes, retry safely."),
  stream: i("A durable, ordered log of events that many consumers can replay (Kafka-style).", "Event pipelines, activity feeds, change data capture. Say the partition key."),
  pubsub: i("Publishers send to a topic and every subscriber gets a copy.", "Fan-out: one event, many reactions such as notifications, analytics and caches."),
  flink: i("Processes streams of events continuously, with state and time windows (Apache Flink).", "Real-time counts, fraud checks, joins of streams, sessionization. Sits between a stream like Kafka and a sink."),
  monitoring: i("Collects metrics and raises alerts.", "Latency, error rates, saturation. Say what pages a human."),
  logging: i("Collects and searches logs from every service.", "Debugging and audit. Say how logs are shipped and how long they are kept."),
}

export const PALETTE: PaletteItem[] = RAW_PALETTE.map((p) => ({ ...p, info: INFO[p.kind] }))

export const GROUPS: PaletteGroup[] = ["Shapes", "Edge and network", "Compute", "Data", "Messaging", "Platform"]
export const itemOf = (kind: string) => PALETTE.find((p) => p.kind === kind)

/** Swatches for the inspector. An empty string means the default for the node. */
export const COLORS = ["", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#64748b"]
