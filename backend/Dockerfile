# API image with headless Chrome for PDF rendering.
FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Debian with Chrome's headless shell on PATH (chromedp finds it as `headless-shell`).
FROM chromedp/headless-shell:stable
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --create-home --shell /usr/sbin/nologin api
COPY --from=build /out/api /usr/local/bin/api
USER api
ENV HOME=/tmp
ENTRYPOINT ["tini", "--", "/usr/local/bin/api"]
