# CyberChef Portable

[gchq/CyberChef](https://github.com/gchq/CyberChef) 的 Tauri 桌面应用封装。

将 CyberChef 的纯静态构建产物打包为单文件桌面应用，通过 GitHub Actions 自动跟随上游发布。

## 下载

前往 [Releases](https://github.com/yourname/CyberChefPortable/releases) 下载对应平台的便携版：

| 平台 | 格式 |
|------|------|
| macOS | `.dmg` |
| Linux | `.AppImage` / `.deb` |
| Windows | `.msi` |

> macOS 首次打开如遇「无法验证开发者」提示，请在系统设置 → 隐私与安全性中允许运行。

## 开发

### 前置要求

- [Rust](https://rustup.rs)
- [Node.js](https://nodejs.org) 22+
- [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)

### 本地构建

```bash
# 安装依赖
npm install

# 下载 CyberChef 并解压到 cyberchef-dist/
node scripts/download-cyberchef.js

# 构建桌面应用
npx tauri build
```

### Docker 构建 (Linux)

```bash
docker build -t cyberchef-portable .
docker run --rm \
  -v "$PWD:/app" \
  -v "$PWD/src-tauri/target:/app/src-tauri/target" \
  -v "$HOME/.cargo/registry:/usr/local/cargo/registry" \
  cyberchef-portable \
  cargo tauri build --bundles appimage,deb
```

## 自动发布

GitHub Actions 每天检查 [CyberChef releases](https://github.com/gchq/CyberChef/releases)，当上游发布新版本时自动构建三端产物并创建 Release。

也可手动触发：[Actions → Build & Release → Run workflow](https://github.com/yourname/CyberChefPortable/actions/workflows/build.yml)

## 项目结构

```
├── scripts/
│   └── download-cyberchef.js   # 下载 CyberChef 构建脚本
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Tauri 入口
│   │   └── main.rs             # Windows 子系统声明
│   ├── icons/                  # 应用图标 (CyberChef 帽子)
│   ├── Cargo.toml
│   └── tauri.conf.json         # Tauri 配置
├── Dockerfile                  # Linux 构建环境
├── .github/workflows/
│   └── build.yml               # CI/CD 三平台构建
└── index.html                  # 占位页（构建时替换为 CyberChef）
```

## License

本项目仅为 CyberChef 的封装，CyberChef 本身使用 [Apache-2.0](https://github.com/gchq/CyberChef/blob/master/LICENSE) 许可。
