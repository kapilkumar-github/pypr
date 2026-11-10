package machine

// Seeds is the fixed bank: 10 utilities, 10 backend components and 10 applications. Each grows over two or three stages.
// cmd/mcgen drafts every one with the AI and stores it only when its reference solutions pass the real runner.
var Seeds = []Seed{
	// ---- Utilities
	{Slug: "rate-limiter", Category: "utility", Title: "Rate limiter", Difficulty: "medium", Minutes: 75, Redis: true,
		Brief: "A rate limiter that allows at most `limit` calls per key per window. Class names: RateLimiter (in memory) and RedisRateLimiter (shared state in FakeRedis).",
		Stages: []string{
			"In-memory RateLimiter({ limit, windowMs, now }) with allow(key) returning true or false. Sliding window or token bucket. Keys are independent, and an injected clock drives time.",
			"RedisRateLimiter({ redis, limit, windowMs, now }) with async allow(key). Two instances sharing one FakeRedis must share the limit. The check and the increment must be atomic (use redis.eval) so concurrent calls never exceed the limit.",
			"Redis failures: when FakeRedis rejects, RedisRateLimiter takes option failOpen (default true): allow the call when true, deny when false. Add a timeoutMs option so a slow Redis (redis.delay) counts as a failure, and recover when Redis comes back.",
		}},
	{Slug: "lru-cache-ttl", Category: "utility", Title: "LRU cache with TTL", Difficulty: "medium", Minutes: 60,
		Brief: "A fixed-capacity cache evicting the least recently used entry, with per-entry expiry. Class LRUCache({ capacity, ttlMs, now }) with get, set, delete, has, size.",
		Stages: []string{
			"LRUCache({ capacity }) with get(key), set(key, value), delete(key), has(key) and a size getter. Reading an entry makes it the most recently used. O(1) operations.",
			"TTL: LRUCache({ capacity, ttlMs, now }) and set(key, value, ttlMs?) with a per-entry override. Expired entries are never returned, do not count in size, and are removed lazily on access.",
			"Stats and hooks: stats() returns { hits, misses, evictions, expirations }; an optional onEvict(key, value, reason) callback where reason is 'capacity', 'expired' or 'deleted'.",
		}},
	{Slug: "event-emitter", Category: "utility", Title: "Event emitter", Difficulty: "easy", Minutes: 45,
		Brief: "Implement an EventEmitter class with on, off, once and emit.",
		Stages: []string{
			"EventEmitter with on(event, fn) returning this, off(event, fn), emit(event, ...args) returning true if any listener ran, calling listeners in registration order.",
			"once(event, fn), listenerCount(event), removeAllListeners(event?), and safe removal: a listener removed during emit still finishes the current emit for the listeners that were registered when emit began.",
			"Errors and limits: emitting 'error' with no listener throws the error; a throwing listener does not stop the other listeners and its error is re-emitted as 'error' after the loop; setMaxListeners(n) with a warning callback option onWarn(event, count) when exceeded.",
		}},
	{Slug: "promise-pool", Category: "utility", Title: "Promise pool", Difficulty: "medium", Minutes: 60,
		Brief: "Run an array of async task functions with at most `concurrency` running at once. Function: runPool(tasks, { concurrency, retries, onProgress, signal }).",
		Stages: []string{
			"runPool(tasks, { concurrency }) resolves with results in the original order and never runs more than concurrency tasks at once. If any task rejects, runPool rejects with that error and starts no further tasks.",
			"Add retries and error collection: option retries (default 0) retries a failing task; option settle: true makes runPool resolve with [{ status, value | reason }] like Promise.allSettled instead of rejecting.",
			"Add onProgress({ completed, total, failed }) called after each task finishes, and cancellation with an AbortSignal option: after abort no new tasks start and runPool rejects with an error whose name is 'AbortError'.",
		}},
	{Slug: "retry-backoff", Category: "utility", Title: "Retry with backoff", Difficulty: "medium", Minutes: 50,
		Brief: "An async retry helper: retry(fn, options) with exponential backoff, jitter and cancellation. Time is injected through a sleep option.",
		Stages: []string{
			"retry(fn, { retries, sleep }) calls fn(attempt) (attempt starts at 1), retries up to `retries` extra times when it rejects, and rejects with the last error. sleep(ms) is injected; delay is fixed baseDelayMs between tries.",
			"Exponential backoff: delay = min(maxDelayMs, baseDelayMs * factor ** (attempt - 1)); options baseDelayMs, factor (default 2), maxDelayMs; plus shouldRetry(error, attempt) to stop early on non-retryable errors.",
			"Jitter and cancellation: option jitter ('none' | 'full') with an injected random() so tests are deterministic; option signal (AbortSignal) that stops waiting and rejects with an error named 'AbortError'; the final error carries the number of attempts in error.attempts.",
		}},
	{Slug: "promise-all-race", Category: "utility", Title: "Promise.all and Promise.race", Difficulty: "easy", Minutes: 40,
		Brief: "Implement promiseAll, promiseRace, promiseAllSettled and promiseAny from scratch without using the built-in Promise combinators.",
		Stages: []string{
			"promiseAll(iterable) and promiseRace(iterable): accept values and promises, keep result order for all, reject on the first rejection, and resolve an empty iterable (all resolves [], race stays pending).",
			"promiseAllSettled(iterable) resolving [{ status: 'fulfilled', value } | { status: 'rejected', reason }] in order, and promiseAny(iterable) resolving with the first fulfilment or rejecting with an AggregateError whose errors are in input order.",
		}},
	{Slug: "logger-library", Category: "utility", Title: "Logger library", Difficulty: "medium", Minutes: 60,
		Brief: "A leveled logger with pluggable formatters and transports. Class Logger({ level, transports, formatter, now }) with error, warn, info, debug methods and child(context).",
		Stages: []string{
			"Logger({ level, transports }) with debug/info/warn/error(message, meta?). Levels order debug < info < warn < error; messages below the threshold are dropped. A transport is { write(entry) } where entry = { level, message, meta, time }. Provide ConsoleTransport-like MemoryTransport that stores entries in .entries.",
			"Formatters and child loggers: option formatter(entry) returning a string (JSON formatter helper jsonFormatter and a textFormatter helper); logger.child({ requestId }) merges context into meta; setLevel(level).",
			"Async transports: a transport may return a promise; logger.flush() resolves when every pending write finishes; a failing transport never breaks logging or the other transports, and its error is passed to option onTransportError(error, transport).",
		}},
	{Slug: "request-batcher", Category: "utility", Title: "Batch API requests", Difficulty: "medium", Minutes: 60,
		Brief: "A request batcher: many callers ask for items by id; the batcher groups them into one backend call. Class Batcher({ fetchMany, maxBatchSize, waitMs, setTimer }).",
		Stages: []string{
			"Batcher({ fetchMany, maxBatchSize }) with get(id) returning a promise. Calls made in the same tick are grouped into one fetchMany(ids) call (use queueMicrotask) that returns a Map id -> value; each caller gets its value, a missing id rejects that caller only.",
			"Deduplication and caching: duplicate ids in one batch are fetched once and share the result; batches larger than maxBatchSize are split; optional cache option keeps resolved values so repeat get(id) skips fetchMany.",
			"Windowing and failures: option waitMs (with an injected setTimer(fn, ms) returning a cancel function) waits before dispatching; if fetchMany rejects, every caller in that batch rejects and the failure is not cached.",
		}},
	{Slug: "request-timeout", Category: "utility", Title: "Request timeout handling", Difficulty: "medium", Minutes: 50,
		Brief: "Wrap async operations with timeouts and cancellation using AbortController. Function: withTimeout(fn, ms, { setTimer, clearTimer }), where fn receives an AbortSignal.",
		Stages: []string{
			"withTimeout(fn, ms, { setTimer, clearTimer }) calls fn(signal) and rejects with an error whose name is 'TimeoutError' if it takes longer than ms; the timer is injected and cleared when fn settles first.",
			"Abort propagation: on timeout the signal passed to fn is aborted (signal.reason is the TimeoutError); an optional parent signal option aborts the call early with an 'AbortError'; the timer never leaks (clearTimer called in every path).",
			"Retries with an overall deadline: fetchWithRetry(fn, { attemptTimeoutMs, totalTimeoutMs, retries, setTimer, clearTimer, now }) tries fn(signal) with a per-attempt timeout and stops when the total deadline passes, rejecting with 'TimeoutError' and the number of attempts in error.attempts.",
		}},
	{Slug: "pubsub-broker", Category: "utility", Title: "Pub/Sub broker", Difficulty: "medium", Minutes: 60,
		Brief: "An in-memory publish/subscribe broker. Class Broker with subscribe(topic, handler), publish(topic, message), wildcards and delivery guarantees.",
		Stages: []string{
			"Broker with subscribe(topic, handler) returning an unsubscribe function and async publish(topic, message) that delivers to all current subscribers in subscription order and resolves with the number of handlers called.",
			"Topic patterns: subscribe('orders.*') matches one segment, 'orders.#' matches any number of trailing segments; exact subscriptions and patterns both receive a message once.",
			"Reliability: a failing handler never blocks others; failed deliveries are retried up to option maxRetries then sent to a dead-letter list broker.deadLetters ({ topic, message, error }); publish resolves after all deliveries settle; per-subscriber ordering is preserved.",
		}},

	// ---- Backend components
	{Slug: "task-scheduler", Category: "backend", Title: "Task scheduler", Difficulty: "hard", Minutes: 90,
		Brief: "Schedule async tasks to run at a time or on an interval with a concurrency limit. Class Scheduler({ concurrency, now, setTimer }).",
		Stages: []string{
			"Scheduler({ concurrency, now, setTimer }) with schedule(fn, { at }) returning an id and a promise on handle.result; tasks run at or after their time, earliest first, never more than concurrency at once. Time is driven by an injected clock and tick() method that runs what is due.",
			"Recurring and cancellation: schedule(fn, { every }) repeats; cancel(id) stops future runs and removes a queued run; a task that throws does not stop the scheduler and its error is available on the run result.",
			"Priorities and overlap: option priority (higher first among due tasks); recurring tasks never overlap themselves (skip a run if the previous one is still running) and stats() reports { running, queued, completed, failed }.",
		}},
	{Slug: "job-queue", Category: "backend", Title: "Job queue with acknowledgements", Difficulty: "hard", Minutes: 90,
		Brief: "A producer/consumer job queue like SQS. Class JobQueue({ now, visibilityTimeoutMs, maxAttempts }) with enqueue, receive, ack, nack.",
		Stages: []string{
			"JobQueue with enqueue(payload) returning an id, receive() returning the oldest available job { id, payload, attempt } or null, and ack(id) which removes it. A received job is invisible to others while it is in flight.",
			"Retries: nack(id, { delayMs }) makes the job available again after the delay; attempt counts deliveries; after maxAttempts a nacked job moves to queue.deadLetters instead.",
			"Visibility timeout: a received job that is not acked within visibilityTimeoutMs becomes available again (using the injected now); ack with a stale receipt (after redelivery) is rejected with an error whose code is 'STALE_RECEIPT'; receive returns receipt handles.",
		}},
	{Slug: "webhook-delivery", Category: "backend", Title: "Webhook delivery", Difficulty: "hard", Minutes: 90,
		Brief: "Deliver webhook events to subscriber endpoints reliably. Class WebhookDispatcher({ send, secret, now, sleep, maxAttempts }) where send(url, headers, body) is an injected async transport.",
		Stages: []string{
			"WebhookDispatcher.dispatch(event) with event = { id, type, data } sends one POST per subscriber from dispatcher.subscribe(url) with body JSON.stringify(event) and header 'X-Signature' = hex HMAC-SHA256 of the body with the secret (use crypto). Returns [{ url, status }].",
			"Retries: a send that rejects or returns status >= 500 is retried with exponential backoff using the injected sleep (base 100 ms), up to maxAttempts; 4xx responses are not retried; each result reports attempts.",
			"Idempotency and ordering: the same event.id is never delivered twice to a subscriber, even when dispatch is called concurrently; the header 'X-Delivery-Id' stays the same across retries; a verifySignature(body, signature, secret) helper compares in constant time.",
		}},
	{Slug: "key-value-store", Category: "backend", Title: "Key-value store", Difficulty: "medium", Minutes: 75,
		Brief: "An in-memory key-value store like a tiny Redis. Class KVStore({ now }) with get, set, delete, expire and transactions.",
		Stages: []string{
			"KVStore with get, set(key, value, { ttlMs }?), delete, has, keys(prefix?) and ttl(key). Expired keys behave as missing. Time is injected with now.",
			"Atomic operations: incr(key, by = 1) on numeric values (error code 'NOT_A_NUMBER' otherwise), setNx(key, value) returning whether it was set, and compareAndSet(key, expected, value).",
			"Transactions: begin(), then set/delete inside, commit() applies atomically, rollback() discards; reads inside a transaction see its own writes; nested begin is an error with code 'NESTED_TRANSACTION'.",
		}},
	{Slug: "connection-pool", Category: "backend", Title: "Connection pool", Difficulty: "hard", Minutes: 90,
		Brief: "A generic resource pool like a database connection pool. Class Pool({ create, destroy, min, max, acquireTimeoutMs, setTimer, clearTimer }).",
		Stages: []string{
			"Pool({ create, max }) with async acquire() returning a resource and release(resource); resources are reused, created lazily up to max, and callers beyond max wait in FIFO order.",
			"Timeouts and health: acquireTimeoutMs rejects a waiting acquire with an error whose name is 'AcquireTimeoutError' (timers injected); option validate(resource) is checked before handing out and bad resources are destroyed and replaced.",
			"Lifecycle: min keeps that many resources warm; drain() stops new acquires, waits for in-use resources to be released, then destroys everything; releasing a resource twice or one the pool does not own throws; stats() reports { size, idle, inUse, waiting }.",
		}},
	{Slug: "distributed-lock", Category: "backend", Title: "Distributed lock", Difficulty: "hard", Minutes: 80, Redis: true,
		Brief: "A lock shared by many processes, stored in FakeRedis. Class RedisLock({ redis, ttlMs, now }) with acquire(name, owner), release(name, owner), and fencing tokens.",
		Stages: []string{
			"RedisLock.acquire(name, owner) returns true if the lock was free (SET NX with a TTL) and false if another owner holds it; the lock expires after ttlMs; re-acquire by the same owner returns true and extends nothing.",
			"Safe release and renew: release(name, owner) only releases when owner matches and returns whether it did (atomically, with redis.eval); renew(name, owner) extends the TTL only for the owner.",
			"Fencing tokens: acquire returns { acquired, token } where token is a number that strictly increases on every successful acquisition of that lock (use incr); a helper guardedWrite(store, name, token, value) rejects writes with a token older than the newest one seen.",
		}},
	{Slug: "workflow-engine", Category: "backend", Title: "Workflow engine", Difficulty: "hard", Minutes: 90,
		Brief: "Run a DAG of async steps with dependencies. Class Workflow with step(name, { deps, run, retries }) and async run(context).",
		Stages: []string{
			"Workflow.step(name, { deps, run }) registers steps; await workflow.run() runs each step after all of its deps, passing run(results) where results maps dep names to their outputs; independent steps run in parallel; resolves with all results. A cycle or unknown dep makes run reject with code 'INVALID_GRAPH' before anything runs.",
			"Failures and retries: step option retries; when a step finally fails, steps that depend on it are skipped, independent steps still finish, and run() resolves with { status, results, errors, skipped } instead of rejecting.",
			"Concurrency and resume: option concurrency limits parallel steps; run({ resumeFrom: previousResult }) skips steps that already succeeded in previousResult and re-runs failed and skipped ones.",
		}},
	{Slug: "notification-service", Category: "backend", Title: "Notification service", Difficulty: "hard", Minutes: 90,
		Brief: "Send notifications over several channels. Class NotificationService({ channels, templates, now, sleep }) where each channel is { name, send(userId, message) }.",
		Stages: []string{
			"NotificationService.notify(userId, templateName, data) renders a template ('Hello {{name}}') and sends it through every channel the user enabled with setPreferences(userId, { email: true, sms: false }); returns [{ channel, status }].",
			"Retries and fallback: a failing channel is retried up to maxAttempts using the injected sleep with backoff; if all attempts fail and a fallback channel is configured ({ fallback: { sms: 'email' } }), it is used; results show attempts.",
			"Delivery tracking and quiet hours: every attempt is stored and queryable with history(userId); notifications during the user's quietHours ({ start, end } in hours) are queued and released by flush() once the quiet hours pass; the same dedupeKey is never sent twice.",
		}},
	{Slug: "inventory-reservation", Category: "backend", Title: "Inventory reservation", Difficulty: "hard", Minutes: 80,
		Brief: "Stock management that never oversells under concurrent orders. Class Inventory({ now }) with addStock, reserve, confirm, release.",
		Stages: []string{
			"Inventory with addStock(sku, qty), available(sku), and reserve(sku, qty) returning a reservation id or throwing an error with code 'INSUFFICIENT_STOCK'; concurrent reserve calls for the same sku (awaited together) never oversell.",
			"Confirm and release: confirm(reservationId) turns it into a sale; release(reservationId) returns the stock; both are idempotent; reservations expire after reservationTtlMs (injected now) and expired holds return stock.",
			"Multi-item orders: reserveOrder([{ sku, qty }, ...]) is all or nothing; two concurrent orders competing for the last units result in exactly one success and no partial holds left behind.",
		}},
	{Slug: "search-autocomplete", Category: "backend", Title: "Search autocomplete", Difficulty: "medium", Minutes: 60,
		Brief: "Prefix suggestions ranked by popularity. Class Autocomplete with add(term, weight), record(term), suggest(prefix, k).",
		Stages: []string{
			"Autocomplete.add(term, weight = 1) and suggest(prefix, k = 5) returning up to k terms that start with prefix, case-insensitive, ranked by weight (ties alphabetical). Use a trie.",
			"Learning: record(term) increments a term's weight (adding it if unknown); remove(term); suggest ranking updates immediately; empty prefix returns the global top k.",
			"Efficiency and freshness: maintain a top-k cache per trie node so suggest does not scan every match (expose nodesVisited from suggest.stats() for tests); decay(factor) multiplies all weights and removes terms that fall under 1.",
		}},

	// ---- Complete applications
	{Slug: "splitwise", Category: "app", Title: "Splitwise expense sharing", Difficulty: "hard", Minutes: 100,
		Brief: "Group expense sharing with balances and simplified settlement. Class Splitwise with addUser, addExpense, balances, settleUp.",
		Stages: []string{
			"Splitwise with addUser(id), addExpense({ paidBy, amount, split: 'equal', among: [ids] }) and balances() returning who owes whom as [{ from, to, amount }] net per pair, in cents with integer math (no float drift).",
			"More split types: split 'exact' (amounts per user) and 'percent' (percentages that must total 100); invalid splits throw errors with code 'INVALID_SPLIT'; remainder cents go to the first users deterministically.",
			"Settlement: simplify() returns the minimum-ish list of transfers that settles everyone (greedy on net balances); settle({ from, to, amount }) records a payment and updates balances; per-group balances with groupId.",
		}},
	{Slug: "parking-lot", Category: "app", Title: "Parking lot", Difficulty: "medium", Minutes: 80,
		Brief: "A multi-floor parking lot. Class ParkingLot with park, unpark, availability and fees.",
		Stages: []string{
			"ParkingLot({ floors: [{ slots: { small: 2, large: 3 } }] }) with park(vehicle: { plate, size }) returning a ticket { id, floor, slot } or throwing code 'LOT_FULL', and unpark(ticketId); a vehicle uses the smallest free slot that fits (small fits small or large).",
			"Allocation rules: prefer the lowest floor; availability() returns free counts per floor and size; the same plate cannot be parked twice (code 'ALREADY_PARKED').",
			"Fees: unpark(ticketId, { now }) returns { fee } using an injected pricing strategy (default: first hour 20, then 10 per started hour, by size multiplier) and the parking duration from an injected clock; pricing strategy is replaceable through the constructor.",
		}},
	{Slug: "elevator-system", Category: "app", Title: "Elevator system", Difficulty: "hard", Minutes: 100,
		Brief: "Simulate elevators serving floor requests. Class ElevatorSystem({ elevators, floors }) driven by step() ticks.",
		Stages: []string{
			"ElevatorSystem({ elevators: 1, floors: 10 }) with request(floor, direction) and step() moving every elevator one floor or one action per call; state() returns [{ id, floor, direction, doors, stops }]. A single elevator serves requests in the direction it is moving first (SCAN).",
			"Multiple elevators: request is assigned to the best elevator (nearest idle or already moving toward the floor in the right direction); ties go to the lowest id; selectFloor(elevatorId, floor) adds a destination from inside.",
			"State machine and edge cases: elevators have states IDLE, MOVING_UP, MOVING_DOWN, DOORS_OPEN; doors stay open for one step at each stop; duplicate requests are ignored; invalid floors throw code 'INVALID_FLOOR'; maintenance(elevatorId) takes one out of service and reassigns its pending stops.",
		}},
	{Slug: "library-management", Category: "app", Title: "Library management", Difficulty: "medium", Minutes: 80,
		Brief: "Books, copies, members and loans. Class Library({ now }) with addBook, addMember, checkout, return.",
		Stages: []string{
			"Library with addBook({ isbn, title, copies }), addMember(id), checkout(memberId, isbn) returning a loan { id, dueAt } (14 days by injected now) or throwing code 'NO_COPIES', and returnBook(loanId); search(title substring).",
			"Rules: members can hold at most 3 books (code 'LIMIT_REACHED'); returnBook returns { lateDays, fine } with a fine of 1 per late day; overdue(now) lists overdue loans.",
			"Reservations: reserve(memberId, isbn) queues the member when no copies are free; when a copy is returned it is held for the first in queue (others cannot check it out until holdExpiresMs passes with the injected clock); cancelReservation.",
		}},
	{Slug: "food-ordering", Category: "app", Title: "Food ordering", Difficulty: "medium", Minutes: 80,
		Brief: "Restaurants, menus and orders with a state machine. Class FoodOrdering with addRestaurant, placeOrder, advance, cancel.",
		Stages: []string{
			"FoodOrdering.addRestaurant({ id, menu: { item: price } }), placeOrder({ customerId, restaurantId, items: { item: qty } }) returning an order { id, total, status: 'PLACED' } (throw code 'UNKNOWN_ITEM' for items not on the menu).",
			"State machine: advance(orderId) moves PLACED -> ACCEPTED -> PREPARING -> OUT_FOR_DELIVERY -> DELIVERED; cancel(orderId) is allowed only before PREPARING (code 'CANNOT_CANCEL'); invalid transitions throw code 'INVALID_TRANSITION'; history(orderId) lists transitions with timestamps from an injected now.",
			"Pricing: coupon(code) support with percentage and flat discounts, minimum order value and one use per customer; delivery fee tiers; totals are integers in cents; orderTotals(customerId) aggregates delivered orders.",
		}},
	{Slug: "ride-booking", Category: "app", Title: "Ride booking", Difficulty: "hard", Minutes: 100,
		Brief: "Match riders with nearby drivers. Class RideService with addDriver, updateLocation, requestRide, completeTrip.",
		Stages: []string{
			"RideService.addDriver(id, { x, y }), updateLocation(id, { x, y }) and requestRide(riderId, { x, y }) returning a trip { id, driverId } using the nearest available driver by Manhattan distance (ties by driver id) or throwing code 'NO_DRIVERS'.",
			"Trip lifecycle and concurrency: a driver on a trip is unavailable until completeTrip(tripId) returns them; two riders requesting concurrently (awaited together) never get the same driver; cancelTrip(tripId) frees the driver.",
			"Pricing and radius: option maxDistance for matching, surge multiplier computed from available drivers vs open requests (injected), fare(tripId) = base + perUnit * distance * surge; driver ratings via rate(tripId, stars) update an average that influences tie-breaking.",
		}},
	{Slug: "movie-ticket-booking", Category: "app", Title: "Movie ticket booking", Difficulty: "hard", Minutes: 100,
		Brief: "Seat selection with temporary holds and no double booking. Class BookingService({ now, holdMs }).",
		Stages: []string{
			"BookingService.addShow(showId, { rows, seatsPerRow }), availableSeats(showId), and book(showId, seats: ['A1','A2'], userId) returning a booking id or throwing code 'SEAT_TAKEN' / 'INVALID_SEAT'; a booking is all or nothing.",
			"Temporary holds: hold(showId, seats, userId) reserves seats for holdMs (injected now); only the holder can confirm(holdId) or release; expired holds free the seats; concurrent hold/book calls for the same seat (awaited together) result in exactly one winner.",
			"Cancellation and pricing: cancel(bookingId) frees seats and returns a refund by time to showtime (injected); price tiers by row ('A'-'B' premium); a user can hold at most 6 seats per show (code 'LIMIT_EXCEEDED').",
		}},
	{Slug: "expense-tracker", Category: "app", Title: "Expense tracker", Difficulty: "medium", Minutes: 75,
		Brief: "Accounts, transactions and reports. Class ExpenseTracker with addAccount, addTransaction, balance, report.",
		Stages: []string{
			"ExpenseTracker.addAccount(id, { openingBalance }), addTransaction({ accountId, amount, category, date }) (negative = expense) and balance(accountId); amounts are integers in cents; unknown accounts throw code 'UNKNOWN_ACCOUNT'.",
			"Aggregation: report({ from, to, accountId? }) returns totals by category and the net; monthly(accountId) returns totals per YYYY-MM sorted ascending; dates are ISO strings.",
			"Transfers and budgets: transfer({ from, to, amount, date }) creates two linked transactions atomically (code 'INSUFFICIENT_FUNDS' when it would overdraw unless overdraft allowed); setBudget(category, limit) and overBudget(month) list categories over their limit.",
		}},
	{Slug: "meeting-room-booking", Category: "app", Title: "Meeting room booking", Difficulty: "medium", Minutes: 75,
		Brief: "Book rooms for time slots without overlaps. Class RoomBooking with addRoom, book, cancel, freeRooms.",
		Stages: []string{
			"RoomBooking.addRoom(id, { capacity }), book({ roomId, start, end, userId }) with numeric start/end (end exclusive) returning a booking id or throwing code 'CONFLICT' on overlap and 'INVALID_RANGE' when end <= start; back-to-back bookings are allowed.",
			"Search and cancel: freeRooms({ start, end, minCapacity }) lists rooms available for the slot sorted by capacity then id; cancel(bookingId); bookingsFor(roomId) sorted by start.",
			"Recurrence and efficiency: book({ ..., repeat: { everyMs, times } }) books all occurrences or none; the overlap check uses a sorted structure (binary search) so booking 5000 non-overlapping slots stays fast (a hidden test checks it finishes quickly); suggest({ start, duration, minCapacity }) returns the earliest free slot per room.",
		}},
	{Slug: "ecommerce-cart", Category: "app", Title: "E-commerce cart", Difficulty: "medium", Minutes: 80,
		Brief: "A shopping cart with pricing, promotions and stock checks. Class Cart({ catalog, inventory }).",
		Stages: []string{
			"Cart with add(sku, qty), remove(sku, qty?), items() and subtotal() in cents, using a catalog { sku: { price } } given to the constructor; adding an unknown sku throws code 'UNKNOWN_SKU'; quantities must be positive integers.",
			"Promotions and tax: applyCoupon(code) with percent or flat discounts and minimum spend, at most one coupon, 'buy 2 get 1 free' on a configured sku, and total({ taxRate }) returning { subtotal, discount, tax, total } with integer rounding rules stated in the Interface.",
			"Stock consistency: checkout() reserves stock from the injected inventory (object with reserve(sku, qty) that throws when short); it is all or nothing, concurrent checkouts of carts for the last unit give exactly one success, and a failed checkout leaves the cart and inventory unchanged.",
		}},
}

// SeedFor finds a seed by slug.
func SeedFor(slug string) (Seed, bool) {
	for _, s := range Seeds {
		if s.Slug == slug {
			return s, true
		}
	}
	return Seed{}, false
}
