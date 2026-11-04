# Changelog

All notable changes to this project are documented here. Versions follow [Semantic Versioning](https://semver.org).

## [0.2.0](https://github.com/vvisionnn/kelp/compare/v0.1.0...v0.2.0) - 2026-11-04

### 🚀 Features

- **design:** Kelp design system and a new top-bar shell ([`a3d2cc5`](https://github.com/vvisionnn/kelp/commit/a3d2cc5081bf26ecffc5bbe1299031d6e29c24cb))
- **access:** Fresh Access pages on the Kelp design system ([`ff3a834`](https://github.com/vvisionnn/kelp/commit/ff3a8344e531638a7131648026a448eb483fc6a0))
- **storage:** Fresh compositions for volumes, collections, erasure coding and nodes ([`4d5dc66`](https://github.com/vvisionnn/kelp/commit/4d5dc66ddc0657d229f0827b50b557d3b798eb79))
- **operations:** Redesign maintenance, messaging and settings ([`fbfbdbd`](https://github.com/vvisionnn/kelp/commit/fbfbdbdc668d3c3120cf430e090fb0f6337e39a6))
- **objects:** Redesign buckets, files and tables ([`1f8c844`](https://github.com/vvisionnn/kelp/commit/1f8c844b7990f14e4debe3b5d8ecc14d28355deb))

### 🐛 Bug Fixes

- **shell:** Label viewers read-only in the top bar ([`33c3ffc`](https://github.com/vvisionnn/kelp/commit/33c3ffc75dd77e2e872278babf1e8370595094e5))
- **page:** Align stat band rows on narrow screens ([`beb8fe0`](https://github.com/vvisionnn/kelp/commit/beb8fe0f0a87546ab8ee97b43df86df80e27f5a0))
- **shell:** Stop the nav's measuring list from widening phones ([`ac3dfb7`](https://github.com/vvisionnn/kelp/commit/ac3dfb7b855c28433e7d72007cd782e0430e3949))

### 📚 Documentation

- New screenshots and a pointer to DESIGN.md ([`95f9552`](https://github.com/vvisionnn/kelp/commit/95f9552ae4bfa544f75de56a25af0252162ac17b))

### 🧪 Tests

- **compose:** Ask Docker whether the admin publishes a port instead of probing the host ([`ba6bf76`](https://github.com/vvisionnn/kelp/commit/ba6bf766710ce4806472709596774c5457125f0f))
## [0.1.0](https://github.com/vvisionnn/kelp/releases/tag/v0.1.0) - 2026-11-04

### 🚀 Features

- **server:** Gateway with sessions, CSRF, and SeaweedFS admin, master, filer and gRPC upstreams ([`18a1bea`](https://github.com/vvisionnn/kelp/commit/18a1bea61a3dc23cba0a5d35c24d33628629c0ee))
- **web:** App shell, sign-in, overview and nodes pages with theme switching ([`39a62b3`](https://github.com/vvisionnn/kelp/commit/39a62b3c9a8c7e81514300776416d12bb4ead98b))
- **web:** Shared action feedback, confirm dialog and copy button; per-area routers ([`6ba06a1`](https://github.com/vvisionnn/kelp/commit/6ba06a1f98f7756e899612a9e45f15960353adbf))
- **seed:** Deterministic sample content and object manifest for the review environment ([`d496bbe`](https://github.com/vvisionnn/kelp/commit/d496bbe9ca3275e8cb33cf032ce561037f960115))
- **storage:** Volume inventory, vacuum, read-only, grow and collection delete API ([`753c0e0`](https://github.com/vvisionnn/kelp/commit/753c0e0856aa8ffb239b3cd762ce6f3a1539af40))
- **storage:** Volumes, collections and erasure coding pages with shard map ([`4a791af`](https://github.com/vvisionnn/kelp/commit/4a791af8b45dac5e844f4b6cdae3843694fd2e1c))
- **web:** Every text column header in Kelp tables sorts ([`b2dfdc0`](https://github.com/vvisionnn/kelp/commit/b2dfdc0bfcdbf90de08e3ebe8405988974097d12))
- **iam:** Access API for users, keys, groups, service accounts and policies with secret redaction ([`2ac82dd`](https://github.com/vvisionnn/kelp/commit/2ac82dd0c41700e8acff108df638731f92cf6d31))
- **access:** Users, access keys, groups, service accounts and policy editor pages ([`745c259`](https://github.com/vvisionnn/kelp/commit/745c259144974f5c1bb0777e585b8ec37ac1aa13))
- **server:** Buckets and filer file browser API with streaming transfers ([`5579966`](https://github.com/vvisionnn/kelp/commit/5579966454c93f089e1e08757182437b242cc742))
- **web:** Buckets, bucket settings, lifecycle and policy editors, and the file browser ([`c9eab81`](https://github.com/vvisionnn/kelp/commit/c9eab818e29c14fba6babe4571d5bc62a0982942))
- **maintenance:** Server API for scheduler, workers, jobs, job type settings, detect and run ([`f707653`](https://github.com/vvisionnn/kelp/commit/f7076534f0e89caf5b0d7d31a25b56475518a0c2))
- **maintenance:** Maintenance overview, job type settings, jobs, job detail and settings pages ([`1f71151`](https://github.com/vvisionnn/kelp/commit/1f71151b1b79d0ead553c50630b1dbc74267e224))
- **web:** Breadcrumbs name the item on detail pages ([`916adf3`](https://github.com/vvisionnn/kelp/commit/916adf3b32d85f133ee34a0457bc23340290dad9))
- **seed:** Seed a realistic cluster through Kelp's API; duplicate buckets return 409 ([`fc01047`](https://github.com/vvisionnn/kelp/commit/fc01047a68c717586e88397228820b9ef586630e))
- **server:** Messaging and S3 Tables APIs with Iceberg metadata and Parquet preview ([`a905872`](https://github.com/vvisionnn/kelp/commit/a905872466b0e110906c66db4cffc5544a1be0cc))
- **web:** Messaging and S3 Tables pages with partition ring, Iceberg schema, snapshots and data preview ([`0804e21`](https://github.com/vvisionnn/kelp/commit/0804e21140cc195b75bc2e3d45113b80b25ab01b))
- One-command review environment with seeded topics and Iceberg tables; non-blocking loaders show skeletons ([`5bf668f`](https://github.com/vvisionnn/kelp/commit/5bf668fa7dd962f8671efda97797d688577fb12d))
- **web:** Designed not-found page, item names in table and topic breadcrumbs, consistent selects ([`62dbfef`](https://github.com/vvisionnn/kelp/commit/62dbfef52f2306464ba5043e61c98b2380a400cd))
- Optional message broker in the compose stack; phone-friendly file lists ([`675cf90`](https://github.com/vvisionnn/kelp/commit/675cf902d64770773a898752032636e79a21dbc4))

### 🐛 Bug Fixes

- **cluster:** Show volume server versions from the admin dashboard ([`a60ac95`](https://github.com/vvisionnn/kelp/commit/a60ac9593c4c09f8c89a2df3d24f0a563f761701))
- Track .env.example and cover every seed generator ([`92ce1df`](https://github.com/vvisionnn/kelp/commit/92ce1df254ce4c328a2f93f8a335430218e308a0))
- **storage:** Shard map fits phone screens ([`ddec04c`](https://github.com/vvisionnn/kelp/commit/ddec04cec427d3091aa01438b8fe89812b823c13))
- **iam:** Explain why non-empty groups cannot be deleted ([`7143e50`](https://github.com/vvisionnn/kelp/commit/7143e507a830f302274bb3d57f428fbef6d3fb9e))
- **web:** Make data table columns sortable from their headers ([`1415435`](https://github.com/vvisionnn/kelp/commit/1415435b1c9890251351c21d060cb5dffe718970))
- **maintenance:** Treat skipped runs as normal, not failures ([`1ddc4c4`](https://github.com/vvisionnn/kelp/commit/1ddc4c44825ec3efdbd82390b4e8209abab299d5))
- **objects:** Show objects in versioned buckets with their version history; keep SeaweedFS bookkeeping out of tags ([`87dca6f`](https://github.com/vvisionnn/kelp/commit/87dca6f0fd3fc6a9c5e983858d330697828945dc))

### ♻️ Refactoring

- **web:** Use the default sortable headers in access pages; skip tests in route generation ([`9f91cfe`](https://github.com/vvisionnn/kelp/commit/9f91cfe4b2854349a30ffa1ddc3636d9ef6537c8))

### 📚 Documentation

- README, notices and screenshots; dev script; boot loader; honest EC file counts ([`8b5e9f9`](https://github.com/vvisionnn/kelp/commit/8b5e9f9ac55a162cb50744bddb4c25fe3b9fc38b))

### 🧪 Tests

- **e2e:** Playwright suite against a native SeaweedFS stack, run in CI ([`6401269`](https://github.com/vvisionnn/kelp/commit/6401269cdf4c0e7837b754c394b24beff2118986))
- Dismiss toasts between tests so a new Toaster cannot replay old ones ([`b5cf138`](https://github.com/vvisionnn/kelp/commit/b5cf1388133a1d7e0bf905dbb67a60587bc3ec37))
- **e2e:** Bucket lifecycle and file browser flows against native SeaweedFS ([`4b28ecb`](https://github.com/vvisionnn/kelp/commit/4b28ecb564a07c2783a596b4d996d91b174765a7))
- **e2e:** Maintenance and settings flows against a native SeaweedFS stack ([`4f6a9fe`](https://github.com/vvisionnn/kelp/commit/4f6a9fe0feab932094c890b0f1151620a74c775e))
- **e2e:** Messaging and tables specs on a native stack with a broker; fix dialog namespace, tag re-sync and mid-election listing ([`4f12012`](https://github.com/vvisionnn/kelp/commit/4f12012af57fc1bdab0b515954b50c31b520ec9b))
- **e2e:** Wait for the new bucket's page before checking its flags ([`720ee80`](https://github.com/vvisionnn/kelp/commit/720ee8072f6c0c4cced50247edbe2ae502f0aa14))

### ⚙️ CI & Build

- Docker image, compose stack with SeaweedFS, tag-based releases to GHCR ([`930ee16`](https://github.com/vvisionnn/kelp/commit/930ee16c07d1e775a9dfd1bd603b05394fef0eb8))
- Lint workflows with actionlint and shellcheck from mise ([`806c90e`](https://github.com/vvisionnn/kelp/commit/806c90e7bb097934ed34ad0a6cefd04bba29526e))

### 📦 Dependencies

- **deps:** Drop recharts and the unused chart component ([`1e1dcd6`](https://github.com/vvisionnn/kelp/commit/1e1dcd608b9ac51b81c1c5dc06a3665a4c1aea59))

### 🧹 Chores

- Scaffold Kelp with mise, Bun, Vite, TanStack and CI ([`b4074d9`](https://github.com/vvisionnn/kelp/commit/b4074d906f9eb9e9bf5dc2ee8d7f33e0865b4bc1))

### Merge

- Storage area (volumes, collections, erasure coding) ([`2d97a1f`](https://github.com/vvisionnn/kelp/commit/2d97a1f9a2f7555a8aa88d3916eed4000cacae5b))
- Access area (users, keys, groups, service accounts, policies) ([`b0409b0`](https://github.com/vvisionnn/kelp/commit/b0409b0178d932a4ff31a3263493a4a6f06a8f0a))
- Object store area (buckets, file browser) ([`b53c0a3`](https://github.com/vvisionnn/kelp/commit/b53c0a3cd358df236d416e21bc68d97c5b93ed1c))
- Operations area (maintenance, settings) ([`602dcdf`](https://github.com/vvisionnn/kelp/commit/602dcdffb12767785988159ea3396e752ebe0e1d))
- Messaging and S3 Tables area (topics, Iceberg tables) ([`c41c25d`](https://github.com/vvisionnn/kelp/commit/c41c25d4c278443d007eb1d944331a59cf7c5d9b))

