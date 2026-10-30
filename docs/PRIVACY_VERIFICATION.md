# Distribution privacy verification / 分发隐私核对

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
