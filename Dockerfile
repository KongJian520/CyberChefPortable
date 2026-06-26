# CyberChefPortable - Linux 构建环境
# 基于 Rust 官方镜像，添加 Node.js 22 和 Tauri 2 系统依赖

FROM rust:1-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# 安装 Tauri 2 Linux 构建依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Tauri 构建核心依赖
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    # 通用工具
    curl \
    wget \
    unzip \
    xz-utils \
    ca-certificates \
    # JavaScript 引擎依赖 (WebKit 运行时)
    libglib2.0-dev \
    libjavascriptcoregtk-4.1-dev \
    libsoup-3.0-dev \
    # 其他构建工具
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 安装 Node.js 22 (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 验证安装
RUN node --version && npm --version && rustc --version && cargo --version

# 创建工作目录
WORKDIR /app

# 预安装 tauri-cli (全局)
RUN cargo install tauri-cli --version "^2"

# 默认构建命令
# 挂载项目目录到 /app 后运行:
#   docker run --rm -v $PWD:/app -v $PWD/src-tauri/target:/app/src-tauri/target cyberchef-portable cargo tauri build
CMD ["cargo", "tauri", "build"]
