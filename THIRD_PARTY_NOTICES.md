# Third-party notices / 第三方声明

## Design and implementation references

[returnk/codex-usage-badge](https://github.com/returnk/codex-usage-badge), commit `b4b2d4327eafd76aa5354043a11a775a08d03b7b`, is the functional reference for this project. Its read-only app-server flow, reset-credit parsing rules and Windows profile-anchor discovery informed our implementation. This is an independent Electron/JavaScript/C# implementation with a new gauge interface, not the upstream Tauri application. The same functional concept and profile-anchor names remain intentional similarities. The upstream artwork, branding and binaries are not included.

本项目参考上述作品的只读额度读取、重置卡解析和头像定位方式；重新实现桌面架构和仪表界面。功能概念及头像定位名称存在有意保留的相似处，未使用原作图标、品牌或安装包。保留原作 MIT 许可如下。

MIT License

Copyright (c) 2026 returnk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Runtime and assets

- Electron: MIT. Its bundled Chromium/Node.js notices are distributed with the runtime.
- electron-builder: MIT, build tool only.
- Gauge icon and interface SVG paths: original assets in this repository, MIT.
- No external fonts, tracking scripts, stock photography or remote UI assets are used. Fonts are provided by the operating system.

Electron 自带 Chromium/Node.js 等组件的许可随安装包保留。图标与界面线条为本仓库自行制作；字体调用操作系统已有字体，没有额外分发字体文件。
