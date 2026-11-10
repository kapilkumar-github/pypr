// Package mcq is the multiple-choice question bank and the timed tests taken from it.
package mcq

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/workspace"
)

type Topic struct {
	Key         string   `json:"key"`
	Name        string   `json:"name"`
	Area        string   `json:"area"`
	Description string   `json:"description"`
	Tags        []string `json:"-"`
	Position    int      `json:"-"`
}

// seed is the topic list. One topic per line under its area:
//
//	# Area
//	Name | what the questions cover | tags (comma separated, lowercase)
//
// Tags decide which topics are "selected" for a workspace: a tag that matches a word in the
// workspace's role, technologies or skills selects the topic. A tag that ends in "*" is a role
// word prefix. Adding a topic means adding a line; questions come from cmd/kbgen.
const seed = `
# Languages
JavaScript | Language core, closures, async, the event loop and modern syntax | javascript,js,ecmascript,react,angular,vue,frontend,front-end,fullstack,full-stack,node,nodejs,node.js
TypeScript | Types, generics, narrowing and the compiler | typescript,ts
Node.js | Event loop, streams, modules, performance and the standard library | node,nodejs,node.js,express,nestjs
Python | Language features, data model, concurrency and the standard library | python,django,flask,fastapi
Java | Language, collections, concurrency, JVM and Spring basics | java,spring,jvm,kotlin
Go | Language, goroutines, channels, interfaces and tooling | go,golang
C# and .NET | Language, LINQ, async, the runtime and ASP.NET | csharp,c#,.net,dotnet,asp.net

# Frontend
React | Components, hooks, rendering, state and performance | react,react.js,reactjs,next,next.js,redux
Angular | Components, DI, RxJS, change detection and routing | angular,rxjs
Vue | Reactivity, components, composition API and tooling | vue,vue.js,nuxt
HTML and CSS | Semantics, layout, accessibility, responsive design | html,css,frontend,front-end,sass,tailwind,ui*

# Backend and data
SQL | Queries, joins, indexes, transactions and query tuning | sql,mysql,postgres,postgresql,oracle,database,backend
PostgreSQL | Internals, indexing, MVCC, extensions and operations | postgres,postgresql
MongoDB | Documents, indexing, aggregation, replication and sharding | mongodb,mongo,nosql
Redis | Data structures, persistence, caching patterns and clustering | redis,cache,caching
Kafka | Topics, partitions, consumer groups, delivery semantics | kafka,streaming,event*
REST API design | Resources, status codes, versioning, idempotency and auth | rest,api,backend,restful
GraphQL | Schemas, resolvers, N+1, caching and security | graphql,apollo
Microservices | Boundaries, communication, resilience and data consistency | microservices,microservice,distributed,backend

# DevOps and cloud
Docker | Images, layers, networking, volumes and security | docker,container*
Kubernetes | Pods, deployments, services, scheduling and operations | kubernetes,k8s,helm
AWS | Core services, IAM, networking, storage and cost | aws,amazon,cloud,ec2,s3,lambda
Git | Branching, rebasing, history and collaboration workflows | git,github,gitlab
CI/CD | Pipelines, testing, releases and deployment strategies | ci/cd,cicd,jenkins,devops,github actions
Linux | Shell, processes, permissions, networking and troubleshooting | linux,unix,bash,devops,sre

# Computer science
Data structures and algorithms | Complexity, arrays, trees, graphs, sorting, dynamic programming | dsa,algorithms,data structures,software,engineer,developer,sde
Object-oriented programming | Principles, SOLID, inheritance, polymorphism and modelling | oop,object-oriented,solid,software,engineer,developer
Design patterns | Creational, structural and behavioural patterns | design patterns,oop,architect*
Operating systems | Processes, threads, memory, scheduling and I/O | operating systems,os,linux,systems
Computer networks | TCP/IP, HTTP, DNS, TLS and troubleshooting | networking,network,tcp,http,dns
Database management systems | Normalisation, transactions, indexing and recovery | dbms,database,sql

# System design
System design | Scalability, caching, databases, queues and trade-offs for large systems | system design,hld,architect*,lead,senior,staff,principal,backend,distributed
Low-level design | Class design, interfaces, patterns and extensibility | lld,low-level design,oop,lead,senior,backend
Security | OWASP risks, authentication, cryptography basics and secure coding | security,owasp,appsec,devsecops
Software testing | Unit, integration and end-to-end testing, mocking and TDD | testing,qa,sdet,tdd,test*

# Management
Engineering management | Hiring, performance, delivery, stakeholders and team health | manager,management,director,head,vp,lead,engineering manager
Agile and Scrum | Ceremonies, estimation, roles and delivery metrics | agile,scrum,kanban,delivery,manager,lead
`

type Catalog struct {
	Topics []Topic
	byKey  map[string]Topic
}

var catalog = mustParse(seed)

func mustParse(src string) Catalog {
	c := Catalog{byKey: map[string]Topic{}}
	area := ""
	for n, line := range strings.Split(src, "\n") {
		line = strings.TrimSpace(line)
		switch {
		case line == "":
		case strings.HasPrefix(line, "# "):
			area = strings.TrimSpace(line[2:])
		default:
			f := strings.Split(line, "|")
			if area == "" || len(f) != 3 {
				panic(fmt.Sprintf("mcq seed line %d: %q", n+1, line))
			}
			t := Topic{Name: strings.TrimSpace(f[0]), Area: area, Description: strings.TrimSpace(f[1]), Position: len(c.Topics)}
			t.Key = workspace.SkillKey(t.Name)
			for _, tag := range strings.Split(f[2], ",") {
				if tag = strings.ToLower(strings.TrimSpace(tag)); tag != "" {
					t.Tags = append(t.Tags, tag)
				}
			}
			if _, dup := c.byKey[t.Key]; dup || t.Key == "" {
				panic("mcq seed: duplicate or empty key for " + t.Name)
			}
			c.byKey[t.Key] = t
			c.Topics = append(c.Topics, t)
		}
	}
	return c
}

// Sync writes the topic list to the database. It is idempotent and keeps questions and outlines.
func Sync(ctx context.Context, pool *pgxpool.Pool) error {
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		for _, t := range catalog.Topics {
			if _, err := tx.Exec(ctx,
				`insert into mcq_topics (key, name, area, description, tags, position) values ($1, $2, $3, $4, $5, $6)
				 on conflict (key) do update set name = excluded.name, area = excluded.area, description = excluded.description,
				                                 tags = excluded.tags, position = excluded.position`,
				t.Key, t.Name, t.Area, t.Description, t.Tags, t.Position); err != nil {
				return err
			}
		}
		return nil
	})
}
