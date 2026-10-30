# Distribution privacy verification / 分发隐私核对

## 0.3.8 follow-up / 每日赠送静音复核（2026-10-30）

The installer payload matches the tested unpacked build, and ZIP ASAR/MCP resources match. The new cadence helper is packaged as source and as a narrow MCP dependency, without user data. Allowlist/private-filename checks find no account settings, balances, private date imports, encrypted keys or browser profiles. Updated images are synthetic native fixtures.

156 package/source/document/image files are compared locally against account markers and API/DPAPI credential sources, with no matches or plaintext output. Production installer-ASAR empty-profile execution passes 18 isolation checks; native startup, host and notifications remain stubbed. This is a targeted follow-up, retaining the historical full-history and separate-Windows-account limits below.

中文：0.3.8增加的类型识别仅为源码与MCP依赖，未包含个人数据。156个包 / 源码 / 文档 / 合成图文件在本机与账号标记及在用凭据比对，无匹配、不回显秘密。安装器ASAR空白用户18项隔离通过；没有重做历史全量审计或新建真实Windows账号。

## 0.3.7 follow-up / 倒计时升级复核（2026-10-30）

The installer application payload matches the tested unpacked build; ZIP ASAR/MCP resources match. ASAR remains restricted to the existing source/assets/license allowlist, with no user settings, balances, imports, dates, credentials or browser profiles. Updated public images come from synthetic native fixtures. Countdown state is calculated locally from existing observations; no login, credential copying or increased upstream polling is added.

152 package/source/document/image files are compared locally against existing account markers and credentials, including DPAPI sources, with no matches or plaintext output. Production installer-ASAR code also passes 18 isolated empty-profile checks. This targeted follow-up retains the stub/native-user and historical full-history limits below; it is not a new full-history or separate-Windows-account audit.

中文：0.3.7包内容按原允许清单核对，未夹带个人设置、余额、日期、凭据或浏览器资料。152个包 / 源码 / 文档 / 合成图文件仅在本机与账号标记及在用凭据比对，无匹配且不回显秘密。实际安装器ASAR空白环境18项隔离通过；没有新建真实Windows账号，也没有重做历史全量审计。新增倒计时只用既有日期，未增加登录或上游查询。

## 0.3.6 follow-up / 创作翻面升级复核（2026-10-30）

The actual installer contains 84 application-payload files and 49 ASAR paths. Its payload matches the tested unpacked build; ZIP ASAR/MCP resources match. Allowlist and private-data filename checks find no saved settings, balance/date imports, credentials or browser profiles. The public creative-face images are synthetic native-window fixtures, not personal screenshots. The new face preference and Suno readings remain per-user runtime data; Suno authentication stays with the existing MCP client.

156 package/source/document/image files are included in local account-marker and credential comparisons, with no matches. No values are printed or included in this report. An installer-ASAR empty-profile run passes 18 isolation checks: no balances, dates, keys or creative rows, and the original face by default; a second profile discovers only its own canary. Startup/host/notification stubs and the historical full-history audit limits below still apply. This is a targeted follow-up, not a new full-history or separate-Windows-account claim.

中文：0.3.6安装器84个应用负载文件、ASAR49个路径与受检构建一致，未包含私人数据文件。156个包内 / 源码 / 文档 / 示例图片在本地与账号标记、在用凭据及DPAPI来源比对，无匹配，不回显秘密。两张新增创作翻面图来自合成原生窗口夹具，非个人截图。实际安装器ASAR空白用户18项检查通过，未继承余额、日期、密钥或翻面偏好；未新建真实Windows账号，原系统任务 / 定位 / 通知的夹具替代边界保持。

## 0.3.5 follow-up / 本次升级复核（2026-10-30）

The 0.3.5 installer contains 84 application-payload files and 46 ASAR paths. Its payload matches the tested unpacked build; ZIP ASAR and MCP resources match. The allowlist and saved-data filename checks find no user settings, balance/date records, imports, encrypted credentials or browser profiles. Across 148 inspected package/source files, local comparisons against existing account markers and API credentials, including DPAPI sources, find no matches; values are never printed or included here. This is a targeted follow-up to the historical full-history audit below, not a new full-history scan.

An empty synthetic current-user environment running production code from the actual installer ASAR passes 16 checks: no discovered tools, account/balance records, website observations, monthly rules, user-entered dates or stored keys; the new-user guide is available. A second profile sees only its own canary configuration. As before, startup registration, host observation and notifications are stubbed to protect the running installation; this is not a separate Windows account or a macOS test. The new `userDates` and `onboardingCompleted` fields are local runtime data, never build inputs.

中文：0.3.5实际安装器84个应用负载文件、ASAR46个路径经允许清单及私人文件名检查，未夹带账号记录、余额 / 日期数据、密钥或浏览器资料。148个包内及源码文件与本机既有账号标记、API凭据及DPAPI来源仅在本地比对，无匹配，不回显秘密。真实安装器ASAR在空白用户环境下16项检查通过，日期为空且可进入首次引导；两个隔离配置只发现各自的工具。此为新增范围的跟进检查，旧版全历史检查范围仍见下文，不把夹具隔离写作真实新Windows账号验证。

## 0.3.4 baseline / 历史基线

Checked on **2026-10-30** against public runtime commit `cde575ab51f567e186e61e000d49a4040e1f3a59` and the published **v0.3.4 Windows installer and ZIP**. This records the inspected release; it is not a claim that every future change is automatically safe.

| Check | Result |
|---|---|
| Public Git history | 22 commits and 217 unique file versions across 15 published branch/tag references checked; no detected private account identifiers, personal machine paths, credential literals or saved user-data files |
| Published downloads | All four GitHub asset digests match the audited local bytes |
| Installer and ZIP | NSIS application payload extracted; corresponding ZIP resources match, including `app.asar` and native helpers |
| Packaged contents | 83 application-payload files inspected; ASAR contains only approved application sources, original assets, package metadata and license notices; no settings, balance imports, host inventories, date observations, encrypted credential files or browser profile data |
| Private-data comparison | Account markers and active credentials compared locally in memory, including DPAPI-protected credential sources; no matching public or packaged content; no plaintext credential values printed or written into the report |
| Public images | Five interface previews visually checked against synthetic demo content; no real account or balance screenshot; historical image objects match the current asset set |
| Empty-profile run | Production code loaded from the extracted installer ASAR with an empty synthetic home, app-data directory and sanitized environment: zero discovered tools, account/balance records, date observations, monthly rules and stored credentials |
| Profile separation | Two isolated profiles discover only their own configured test integration; neither inherits the other's records or credentials |

The native empty-profile run passed 14 checks. Windows startup registration, native host observation and notification delivery were stubbed to protect the user's running installation; a separate Windows account was not created. Runtime path inspection confirms `os.homedir()`, Electron per-user app data, current-user environment/configuration and Windows SID/session scoping, rather than a developer account or machine path. The original badge also starts without a saved quota snapshot.

Audited SHA-256 values:

- Windows installer: `32d41c205d9b5ce5f8fe91c38f2a93670b80a8142a9222d3833ff27ce0acdbdf`
- Windows ZIP: `9f91703f134046ec03eb4cfefc784917145546168a56642f56ce7a41a8005c97`

Public author attribution, repository identity, authorized support contact information, provider catalog metadata and clearly synthetic demos are intentional. They are distinct from a user's platform account, configured connection, credential or quota history. Actual user files stay in the current user's app-data directory. No embedded provider browser sign-in component, browser-cookie reader or bundled developer profile is present in this release. Optional, explicitly configured API-key connections remain locally encrypted.

The repository also runs an automated two-profile isolation regression. Ignore rules now explicitly cover runtime data/credential filenames, in addition to local verification and build-output directories. Ignore rules alone are not evidence: future releases should repeat inspection of actual published artifacts and newly changed public files.

## 简体中文

2026-10-30 对公开运行版本 `cde575a`、v0.3.4 Windows 安装包和 ZIP 核对：公开 Git 历史、实际解包文件、截图、账户标记与在用凭据比对均未发现本人私有账号、密钥或真实积分记录被带出。GitHub 四个附件的摘要与本地受检文件一致，安装包与 ZIP 的业务资源一致。

从实际安装包提取的代码在空白用户目录和清理过的环境变量中启动，工具、余额、日期、月度规则和凭据均为零。另两个隔离目录只发现各自配置的测试连接，没有互相继承数据。该原生试跑共14项检查；为保护正在使用的安装，启动任务、原生定位和通知发送被隔离替代，未新建 Windows 系统账号。源码路径使用当前用户目录、环境变量与 SID/会话，不指向开发者电脑。

公开作者署名、仓库身份、已授权的产品联系方式、平台支持清单和合成示例仍保留；这些不是用户的平台登录和余额记录。真实配置保存在安装者自己的用户数据目录。本次没有修改运行代码或重发安装包；新增隔离回归检查及忽略规则用于防止以后误带数据，后续发布仍需核对实际产物。
