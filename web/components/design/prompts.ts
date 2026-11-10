/** System design prompts a board can start from. Static: they change rarely and need no backend. */
export type DesignPrompt = {
  key: string
  title: string
  summary: string
  functional: string[]
  /** What a good answer states. Hidden from the learner, who writes their own non-functional requirements and estimates; the interviewer compares. */
  nonFunctional: string[]
  /** Back-of-envelope numbers a good answer works out. Hidden from the learner like `nonFunctional`. */
  scale: string[]
  /** What a good design covers; ticked off on the board. */
  checklist: string[]
}

const COMMON = ["Clear API (endpoints, request and response)", "Data model and storage choice", "Scaling plan (load balancing, partitioning, caching)", "Failure handling and single points of failure", "Trade-offs and what you would do next"]

export const PROMPTS: DesignPrompt[] = [
  {
    key: "url-shortener",
    title: "URL shortener",
    summary: "Short links that redirect, with click counts.",
    functional: ["Create a short link for a long URL", "Redirect a short link to the long URL", "Optional custom alias and expiry", "Click analytics"],
    nonFunctional: ["Redirects under 100 ms at p99", "99.99% availability for reads", "Links are not guessable in order"],
    scale: ["100M new links per month", "100:1 read to write ratio, about 4K redirects/s on average", "5 years of links, about 6B rows"],
    checklist: ["Short code generation (hash, counter or random) and collisions", "Read-heavy path: cache in front of the database", "301 vs 302 redirect and analytics impact", ...COMMON],
  },
  {
    key: "rate-limiter",
    title: "Distributed rate limiter",
    summary: "Limit requests per user or key across many API servers.",
    functional: ["Limit by user, IP or API key", "Different limits per route or plan", "Return 429 with retry information"],
    nonFunctional: ["Adds under 5 ms to a request", "Accurate enough across servers", "Fails open or closed by choice"],
    scale: ["1M requests/s across the fleet", "10M active keys"],
    checklist: ["Algorithm (token bucket, sliding window) and why", "Shared state in Redis with atomic updates", "Race conditions across servers", "What happens when Redis is down", ...COMMON],
  },
  {
    key: "news-feed",
    title: "News feed",
    summary: "A home timeline of posts from people you follow.",
    functional: ["Publish a post", "See a ranked feed of followed accounts", "Like and comment"],
    nonFunctional: ["Feed loads under 300 ms", "Eventually consistent is fine", "Celebrity accounts must not melt the system"],
    scale: ["300M daily users", "Average 200 follows", "Some accounts have 50M followers"],
    checklist: ["Fan-out on write vs on read, and a hybrid for celebrities", "Feed cache per user", "Ranking and pagination", ...COMMON],
  },
  {
    key: "chat",
    title: "Chat application",
    summary: "One-to-one and group messaging with delivery status.",
    functional: ["Send and receive messages in real time", "Group chats", "Online presence and read receipts", "Message history"],
    nonFunctional: ["Messages arrive in order per chat", "No lost messages", "Works on flaky mobile networks"],
    scale: ["50M daily users", "40 messages per user per day", "Groups up to 500 members"],
    checklist: ["Connection layer (WebSocket) and routing a message to the right server", "Ordering and idempotent delivery", "Offline users and push notifications", "Message storage and retention", ...COMMON],
  },
  {
    key: "ride-sharing",
    title: "Ride sharing",
    summary: "Match riders with nearby drivers and track trips.",
    functional: ["Request a ride", "Match with a nearby driver", "Live location during the trip", "Pricing and payment"],
    nonFunctional: ["Match within seconds", "Location updates every 4 seconds", "A driver is never double-booked"],
    scale: ["5M drivers, 1M concurrent", "Location writes: about 250K/s"],
    checklist: ["Geo index for nearby search (geohash, quadtree)", "Matching and double-booking prevention", "Location ingestion pipeline", "Trip state machine", ...COMMON],
  },
  {
    key: "video-streaming",
    title: "Video streaming",
    summary: "Upload, process and stream videos worldwide.",
    functional: ["Upload a video", "Transcode into multiple resolutions", "Stream with adaptive bitrate", "Search and recommendations"],
    nonFunctional: ["Playback starts under 2 seconds", "Handle huge files reliably", "Cost-efficient storage"],
    scale: ["1B hours watched per day", "500 hours of video uploaded per minute"],
    checklist: ["Upload path (chunked, resumable) and object storage", "Transcoding pipeline with a queue", "CDN and caching of segments", "Metadata store", ...COMMON],
  },
  {
    key: "notification-system",
    title: "Notification system",
    summary: "Send push, SMS and email notifications reliably.",
    functional: ["Send via push, SMS and email", "User preferences and quiet hours", "Templates", "Delivery tracking"],
    nonFunctional: ["At-least-once delivery without duplicates for users", "Spikes of millions at once", "Providers fail and rate limit"],
    scale: ["10M notifications per hour at peak"],
    checklist: ["Queue per channel and workers", "Retries with backoff and a dead-letter queue", "Deduplication and idempotency", "Provider failover", ...COMMON],
  },
  {
    key: "search-autocomplete",
    title: "Search autocomplete",
    summary: "Suggest completions as the user types.",
    functional: ["Top suggestions for a prefix", "Ranking by popularity and freshness", "Personalisation (optional)"],
    nonFunctional: ["Response under 50 ms", "Suggestions update within hours"],
    scale: ["5B searches per day", "Peak 100K queries/s"],
    checklist: ["Trie or prefix index and top-K per node", "Offline aggregation of query logs", "Caching at the edge and the client", ...COMMON],
  },
  {
    key: "file-storage",
    title: "File storage and sync",
    summary: "Store files and sync them across devices.",
    functional: ["Upload and download files", "Sync across devices", "Sharing with permissions", "Version history"],
    nonFunctional: ["Durability above everything", "Resumable large uploads", "Conflicts are handled"],
    scale: ["500M users", "Average 10 GB each"],
    checklist: ["Chunking and deduplication", "Metadata service vs block storage", "Sync protocol and conflict resolution", "Sharing and access control", ...COMMON],
  },
  {
    key: "payments",
    title: "Payment system",
    summary: "Charge customers safely and keep the books right.",
    functional: ["Create a payment", "Refunds", "Webhooks to merchants", "Reconciliation"],
    nonFunctional: ["Never charge twice", "Strong consistency for money", "Auditable"],
    scale: ["1K payments/s at peak"],
    checklist: ["Idempotency keys", "Payment state machine and ledger", "Calling external processors, timeouts and retries", "Reconciliation jobs", ...COMMON],
  },
  {
    key: "web-crawler",
    title: "Web crawler",
    summary: "Crawl the web politely and store pages for indexing.",
    functional: ["Fetch pages from seed URLs", "Extract links", "Avoid duplicates", "Respect robots.txt"],
    nonFunctional: ["Politeness per host", "Handle traps and slow servers", "Re-crawl by freshness"],
    scale: ["1B pages per month"],
    checklist: ["URL frontier with priority and per-host queues", "Duplicate detection (URL and content)", "Distributed workers and DNS caching", "Storage of fetched content", ...COMMON],
  },
  {
    key: "distributed-cache",
    title: "Distributed cache",
    summary: "A key-value cache spread over many nodes.",
    functional: ["Get, set and delete with TTL", "Eviction when full", "Add and remove nodes"],
    nonFunctional: ["Sub-millisecond reads", "Survive node loss", "Even load across nodes"],
    scale: ["1M ops/s", "10 TB of hot data"],
    checklist: ["Partitioning with consistent hashing", "Replication and failover", "Eviction policy (LRU) and TTL", "Hot keys and cache stampede", ...COMMON],
  },
]

export const promptByKey = (key: string | null | undefined) => PROMPTS.find((p) => p.key === key)

/** The question as the learner sees it. */
export function requirementText(p: DesignPrompt) {
  return [p.title, p.summary, "Functional requirements:", ...p.functional.map((x) => "- " + x)].join("\n")
}

/** What the interviewer knows and the learner does not: the expected non-functional requirements and scale. */
export function referenceText(p: DesignPrompt) {
  return ["Expected non-functional requirements:", ...p.nonFunctional.map((x) => "- " + x), "Expected scale:", ...p.scale.map((x) => "- " + x), "Checklist:", ...p.checklist.map((x) => "- " + x)].join("\n")
}
