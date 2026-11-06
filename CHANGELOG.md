# Changelog

All notable changes to this project are documented here. Versions follow [Semantic Versioning](https://semver.org).

## [0.6.0](https://github.com/vvisionnn/kelp/compare/v0.5.1...v0.6.0) - 2026-11-06

### 🚀 Features

- **web:** A docked sidebar that folds to an icon rail, and smoother motion for less work ([`2d9ac14`](https://github.com/vvisionnn/kelp/commit/2d9ac142c7b9b7f4d3ebacf6f5b5e82958822761))
- **web:** A flat sidebar on a surface of its own, with a disk meter and the current page in indigo ([`709b520`](https://github.com/vvisionnn/kelp/commit/709b5208f2dff9971924e55ea50280dd6b9c19d0))
- **web:** Roomy on large displays: a wider page column shared with the toolbar, more space between sheets ([`87e004e`](https://github.com/vvisionnn/kelp/commit/87e004e010dd99471bbd0578eda652f4691b01e5))

### 🐛 Bug Fixes

- **web:** Column chart labels no longer run into each other; the sheet light moves once a frame ([`c0889a3`](https://github.com/vvisionnn/kelp/commit/c0889a3ff2d506447241120870af2264c20a9804))
- **web:** Users and Groups get distinct icons in the sidebar ([`494acee`](https://github.com/vvisionnn/kelp/commit/494aceeaf3c9c9b4d46586c6fd9f62e4c50109ca))
- **web:** The theme previews in Settings draw the docked sidebar ([`011bd1b`](https://github.com/vvisionnn/kelp/commit/011bd1b76b250f97a3cfba4e9904e7d21b706a06))

### ⚡ Performance

- **server:** Send brotli or gzip copies of the build, compressed once at build time ([`7e849b8`](https://github.com/vvisionnn/kelp/commit/7e849b866be028ebf3075ff3718bead8ef6fe880))
- **web:** First data on screen in half the time ([`1c48bbc`](https://github.com/vvisionnn/kelp/commit/1c48bbc8e5c169684abf5c04915e62db543ee390))
- **web:** Route files export only their route, so pages' helpers leave the first download ([`5ad9edf`](https://github.com/vvisionnn/kelp/commit/5ad9edf40bd45c6e1804dafa6546e92743f75690))
- **web:** Dialogs, sheets and the command menu open without dropping a frame ([`8c4b003`](https://github.com/vvisionnn/kelp/commit/8c4b0031587f5aa7efe206cd41c4ba0126c8a1bb))
- **web:** Revisiting a page reads no layout: charts remember their width, the data grid reads dir from the attribute ([`c463891`](https://github.com/vvisionnn/kelp/commit/c463891ed914309d198ef72b1a5784d8fc9ffa6c))

### 📚 Documentation

- The performance budgets as measured on identical data ([`fcb2b19`](https://github.com/vvisionnn/kelp/commit/fcb2b19e605314f041897a6daedfc797292f2978))
## [0.5.1](https://github.com/vvisionnn/kelp/compare/v0.5.0...v0.5.1) - 2026-11-06

### 🐛 Bug Fixes

- **web:** An open tab survives a Kelp upgrade instead of crashing on a page it hasn't opened yet ([`525ab20`](https://github.com/vvisionnn/kelp/commit/525ab20be887f9cb74100daf2596c4937c55be62))
## [0.5.0](https://github.com/vvisionnn/kelp/compare/v0.4.0...v0.5.0) - 2026-11-06

### 🚀 Features

- **seaweedfs:** Validate new SeaweedFS releases daily and track the last-known-good version ([`6842b33`](https://github.com/vvisionnn/kelp/commit/6842b33b4c79276c30178d7e39e1c067564e8ac3))
- **web:** Add a shared motion foundation for loading, morphing text and charts ([`0a3f462`](https://github.com/vvisionnn/kelp/commit/0a3f4623f3b19c56f08c34c8101a7086bc3e29e1))
- **web:** Carry the motion language into sign-in, tables, overlays and the page edge ([`57ba432`](https://github.com/vvisionnn/kelp/commit/57ba432de0f4548cc7a75e6da4609128bde66565))
- **web:** Bring buckets, files and the bucket editors onto the motion foundation ([`83d8c99`](https://github.com/vvisionnn/kelp/commit/83d8c991d6d55b33177526e92d464e80803d8dbc))
- **web:** Bring the access pages onto the motion foundation ([`1c0fb2d`](https://github.com/vvisionnn/kelp/commit/1c0fb2d2fde6c012a73bcfa3f909eb86e9869474))
- **web:** Give operations pages layout-matched loading and morphing status ([`3841fca`](https://github.com/vvisionnn/kelp/commit/3841fca878124b6eaf2a826341666178d5586afd))
- **web:** Bring nodes, volumes, collections and erasure coding onto the motion foundation ([`976e623`](https://github.com/vvisionnn/kelp/commit/976e6230418b201e0e85bc1909c368a3d43ef7be))
- **web:** Crossfade only the page area between pages, and let changes land quietly while a view catches up ([`ad67bd7`](https://github.com/vvisionnn/kelp/commit/ad67bd7f79ae50229ee4d8fe89e81be0c37c3be8))

### 🐛 Bug Fixes

- **seaweedfs:** Run SeaweedFS 4.52 by default ([`a4ad4a5`](https://github.com/vvisionnn/kelp/commit/a4ad4a5aaa7799645caa9f729d99af7737fd840f))
- **seaweedfs:** Format the LKG file like CI's lint and check lint before committing a promotion ([`1f818dd`](https://github.com/vvisionnn/kelp/commit/1f818dd327d576f5a5d8a72397d56fc6ac36edb4))
- **seaweedfs:** Close compatibility issues only when their version passes or the LKG reaches it ([`ca89241`](https://github.com/vvisionnn/kelp/commit/ca89241f678d2d1a83476e1600475cddd97647fd))
- **web:** Give every folder one summary shape, and stop morphing text from doubling for search and tests ([`41809ac`](https://github.com/vvisionnn/kelp/commit/41809ac890e570e26c934e8ae19424e04b2edd6f))
- **web:** Segmented controls keep their natural width on phones, and stat hints truncate cleanly ([`165bd5a`](https://github.com/vvisionnn/kelp/commit/165bd5a0d14f94e1d6137bc371d7821092c6193c))
- **web:** Overview lands with its trend lines and keeps a slot for the range control ([`1eb4c41`](https://github.com/vvisionnn/kelp/commit/1eb4c41bc338bb7b57d1daecc36a9885ee03b081))
- **web:** A view fading out is hidden from assistive tech, and shift failures name what moved ([`8971b5b`](https://github.com/vvisionnn/kelp/commit/8971b5bfd38f1986b34e3a2b40559fcfbf814893))
- **web:** Play entrances once, when data first arrives, and keep the sidebar still between pages ([`3fa73fc`](https://github.com/vvisionnn/kelp/commit/3fa73fcf1431538516ac02bd3434f74a43d120d7))
- **web:** The theme icon turns only on a theme change, and table rows rise only as they first arrive ([`e5c09af`](https://github.com/vvisionnn/kelp/commit/e5c09af882e956e99d0d6e45c1c7b06764b1f452))
- **web:** Countdown meters, chart clips and volume fill bars stay still while a view catches up ([`1fcacd1`](https://github.com/vvisionnn/kelp/commit/1fcacd194e0d37f7718a68251bd9a0c0491fc1ec))
- **web:** The sidebar says when the cluster can't be reached instead of connecting forever ([`4de56a8`](https://github.com/vvisionnn/kelp/commit/4de56a8e964bdf1c614cf2472b1dd13582231030))
- **web:** Messaging keeps a disabled create action without a broker, and chart axes never repeat a label ([`76071a6`](https://github.com/vvisionnn/kelp/commit/76071a6aee25335441f5b70ca87db816f9b6bea2))
- **web:** Counts name one thing in the singular ([`c0a40cc`](https://github.com/vvisionnn/kelp/commit/c0a40cc671ced38ba4f6abb67eae882495f3fa2a))
- **web:** Every page makes its entrance the first time it shows, and revisits display at once ([`f0ef455`](https://github.com/vvisionnn/kelp/commit/f0ef4557a6584420a9377f65989e8b46a49d0de0))

### 📚 Documentation

- Refresh README screenshots ([`15245da`](https://github.com/vvisionnn/kelp/commit/15245dac5df73eeb12d40e1a58608cbb1a4d4870))

### 🧪 Tests

- **web:** Add a loading-state QA script and match Overview's ghosts to its panels ([`a6350ce`](https://github.com/vvisionnn/kelp/commit/a6350ce241f45dd49b90c0e8dd40ae19d0dd3427))
- **e2e:** Hold every route to a still layout while data lands ([`e931d24`](https://github.com/vvisionnn/kelp/commit/e931d245effe7f3445a70be1e60d83d4ed3b807a))
- **web:** Check crossfades without waiting on animation timing ([`27df357`](https://github.com/vvisionnn/kelp/commit/27df357a9fa45ed9b00af5b7db133bcf7b90580a))
- **e2e:** Give the access lifecycle journey a slow-test budget ([`ac56849`](https://github.com/vvisionnn/kelp/commit/ac568493d482d28bbc18d5fecddfbe7e5d815b6f))

### 🧹 Chores

- **seaweedfs:** Start the LKG at 4.51 so the first compatibility run proves promotion ([`35dfb01`](https://github.com/vvisionnn/kelp/commit/35dfb0137855465a1429a814ab4f4d19873dce1b))
- Format scripts/seaweedfs.ts ([`ba8ff1e`](https://github.com/vvisionnn/kelp/commit/ba8ff1e217ca84913016cb3d3dea6f4666424d76))

### Wip

- Glide unknown heights ([`9c66115`](https://github.com/vvisionnn/kelp/commit/9c66115117e2757f4b1f0936abd4e31d1a675e35))
## [0.4.0](https://github.com/vvisionnn/kelp/compare/v0.3.0...v0.4.0) - 2026-11-05

### 🚀 Features

- **design:** X.ai-informed color — monochrome actions, spectrum accents, validated indigo/orange/teal/violet/amber data palette; quiet sidebar icons with a spectrum indicator; telemetry contract ([`bf0b93c`](https://github.com/vvisionnn/kelp/commit/bf0b93cfa6efb382b19adafe1e7ef98d99c7fc5e))
- **overview:** Big-screen dashboard with live traffic, latency, capacity, busiest buckets; Kelp chart kit (time series, sparkline, ring, columns, bar list, stat tile) ([`671a2c8`](https://github.com/vvisionnn/kelp/commit/671a2c84682d7c91bf529955477433b8264d2da5))
- **login:** Spectrum-tinted light rays ([`afea6ae`](https://github.com/vvisionnn/kelp/commit/afea6ae5e7700ae3f826c408e95bfd6d0128e061))
- **telemetry:** Sample SeaweedFS Prometheus metrics into live time series ([`169693c`](https://github.com/vvisionnn/kelp/commit/169693c3a11ffcad729e19326d18adb6d861f229))
- **review:** A light synthetic S3 workload so live charts have traffic ([`9653968`](https://github.com/vvisionnn/kelp/commit/9653968665b879f01130950ca7b434ed0bdd909b))
- **storage:** Data-rich Volumes, Collections, Erasure coding and Nodes dashboards ([`a5fb690`](https://github.com/vvisionnn/kelp/commit/a5fb690f7d59c1c4b149f6ddab975f2c6e78566a))
- **operations:** Data-rich maintenance, messaging and settings dashboards ([`ae83fbe`](https://github.com/vvisionnn/kelp/commit/ae83fbe7289ad6fc31c7ee9b2c8e6740b9ba2e86))
- **objects:** Data-rich buckets, files and tables dashboards ([`c395796`](https://github.com/vvisionnn/kelp/commit/c395796fec5407cd23e635f36e73c1352c928947))
- **access:** Data-rich Access dashboards ([`237dafa`](https://github.com/vvisionnn/kelp/commit/237dafa9a008dfaf94ca90aa2d8bb2f573b57d83))
- **charts:** Stat tiles roll whole numbers ([`950ab72`](https://github.com/vvisionnn/kelp/commit/950ab7227e72cd820ac7652dc8a81929f106f50f))
- **charts:** Robust y axis keeps one spike from flattening a chart ([`43e5832`](https://github.com/vvisionnn/kelp/commit/43e583283060cef67bea02d3c04b197481c6e019))

### 🐛 Bug Fixes

- **overview:** Object size buckets are per-bucket counts with an open-ended last bucket ([`5acea45`](https://github.com/vvisionnn/kelp/commit/5acea45ff2ea9ee247f28b838a1aee8edee07af0))
- **charts:** Stat tile trends run along the bottom; second-level axis ticks for short ranges ([`0c43112`](https://github.com/vvisionnn/kelp/commit/0c43112df7a7e0e30e7fe99fd399acbdc5c0f29a))
- **page:** Panels can shrink inside grids ([`02ad330`](https://github.com/vvisionnn/kelp/commit/02ad33062b51b87e771e4167de8b8aa8bdc23771))
- **charts:** Hidden data tables no longer lengthen the page ([`2a27a8f`](https://github.com/vvisionnn/kelp/commit/2a27a8f5b03a49c30f0cb729e9ecbf14a74d693c))
- **nodes:** Show summed CPU as cores in use ([`1ccf863`](https://github.com/vvisionnn/kelp/commit/1ccf863c948dd44f9555a93556ae0aebdef39df1))
- **charts:** Cut-off note sits with the legend ([`045bca5`](https://github.com/vvisionnn/kelp/commit/045bca5d2edb396b77e7c4fb8d56aae631fb5cf1))
- **charts:** No repeated axis labels; relative times split into value and unit ([`b1d3a64`](https://github.com/vvisionnn/kelp/commit/b1d3a6435d589837fe6bde3d5b15349e484ed291))

### ♻️ Refactoring

- **charts:** StackedColumns joins the chart kit; stat tile trends never widen a tile ([`a28cc0b`](https://github.com/vvisionnn/kelp/commit/a28cc0b7a10edfcee5de5b28f59e9cc248b26343))

### 📚 Documentation

- **design:** X.ai color thinking, quiet icons, charts; spectrum meters ([`ec98c4e`](https://github.com/vvisionnn/kelp/commit/ec98c4e533e605fe4808fd4dffa0943230cfbc0a))
- Dashboard screenshots ([`6018ccd`](https://github.com/vvisionnn/kelp/commit/6018ccd26bf3d796ce0ce7b10ef800ed8a14da57))

### 🧪 Tests

- **e2e:** Scope selectors for pages that now repeat names in charts ([`d0b76b4`](https://github.com/vvisionnn/kelp/commit/d0b76b4e1d838c072e4255c84f331c0282f97d83))
## [0.3.0](https://github.com/vvisionnn/kelp/compare/v0.2.0...v0.3.0) - 2026-11-04

### 🚀 Features

- **design:** Apple-grade dashboard foundation ([`f2a17d9`](https://github.com/vvisionnn/kelp/commit/f2a17d91eaead3f9d36b219c8ad7e29f72611904))
- **shell:** Identity tiles in search, lighter overlays, two-column widgets on phones ([`c061ce3`](https://github.com/vvisionnn/kelp/commit/c061ce38aba704364a5891b5b467cd8c2317ce75))
- **access:** Access pages as a dense dashboard ([`e4bd551`](https://github.com/vvisionnn/kelp/commit/e4bd551b49dc5ce7452531fc3a0609b8771e91d7))
- **storage:** Storage and Nodes pages as a dense dashboard ([`ef18329`](https://github.com/vvisionnn/kelp/commit/ef183299fa62c6866d4ed42e565f09f7dfb50f86))
- **objects:** Dashboard layout for buckets, files and tables ([`978e713`](https://github.com/vvisionnn/kelp/commit/978e7135439e59f5a1e098adc08fe7bed5919d18))
- **operations:** Dashboard layouts for maintenance, messaging and settings ([`7f762b0`](https://github.com/vvisionnn/kelp/commit/7f762b04c345953041e724fbc47a87622a672411))

### 🐛 Bug Fixes

- **controls:** Segmented control sizes to labels and scrolls; table toolbar can shrink; shared pickSegment test helper ([`cd402eb`](https://github.com/vvisionnn/kelp/commit/cd402ebd3999edeef7902409a764eb92113365e8))
- Name sections as regions, Automatic theme label, e2e for segmented controls ([`3cdaf41`](https://github.com/vvisionnn/kelp/commit/3cdaf41f64a0cfc6ba0507d36bdc6a553d597bf4))

### 📚 Documentation

- Dashboard screenshots ([`dd0f64f`](https://github.com/vvisionnn/kelp/commit/dd0f64f07df7d245713ffa5c3a0eaa3b67370cf1))
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

