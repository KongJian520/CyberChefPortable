#!/usr/bin/env node
/**
 * download-cyberchef.js
 * 从 gchq/CyberChef GitHub releases 下载最新静态构建产物并解压。
 * 每个网络操作最多重试 3 次。
 *
 * 用法:
 *   node scripts/download-cyberchef.js
 *
 * 行为:
 *   1. 查询 gchq/CyberChef 最新 release (最多 3 次重试)
 *   2. 下载 zip 资源 (最多 3 次重试)
 *   3. 解压到 cyberchef-dist/ 目录
 *   4. 打印版本号 (tag_name) 到 stdout
 *   5. 写入 .cyberchef-version 文件
 */

const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = 'gchq/CyberChef';
const DIST_DIR = path.resolve(__dirname, '..', 'cyberchef-dist');
const VERSION_FILE = path.resolve(__dirname, '..', '.cyberchef-version');
const ZIP_PATH = path.resolve(__dirname, '..', 'cyberchef.zip');
const MAX_RETRIES = 3;

function log(msg) {
  process.stderr.write(`[cyberchef] ${msg}\n`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的异步操作包装
 * @param {() => Promise<T>} fn  要执行的操作
 * @param {string} label         操作描述（用于日志）
 * @param {number} maxRetries    最大重试次数
 * @returns {Promise<T>}
 */
async function withRetry(fn, label, maxRetries) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        log(`[${label}] 第 ${attempt + 1} 次尝试 (已重试 ${attempt})...`);
      }
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const waitMs = 2000 * (attempt + 1); // 2s, 4s, 6s ...
        log(`[${label}] 错误: ${err.message}`);
        log(`[${label}] ${waitMs / 1000}s 后重试 (${maxRetries - attempt} 次剩余)...`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

function buildHeaders() {
  const headers = {
    'User-Agent': 'CyberChefPortable/1.0',
    'Accept': 'application/vnd.github+json',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: buildHeaders() }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location, { headers: buildHeaders() }, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (res2.statusCode < 200 || res2.statusCode >= 300) {
                reject(new Error(`HTTP ${res2.statusCode}: ${json.message || '(未知错误)'}`));
                return;
              }
              resolve(json);
            } catch (e) {
              reject(new Error(`JSON 解析失败: ${e.message}`));
            }
          });
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${json.message || '(未知错误)'}`));
            return;
          }
          resolve(json);
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    log(`下载 ${url} ...`);
    const file = fs.createWriteStream(dest);

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'CyberChefPortable/1.0',
      }
    };

    https.get(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 400) {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode}: 下载失败`));
        });
        return;
      }
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      const total = parseInt(res.headers['content-length'], 10) || 0;
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && downloaded % (1024 * 1024 * 5) < chunk.length) {
          log(`进度: ${(downloaded / (1024 * 1024)).toFixed(1)} MB / ${(total / (1024 * 1024)).toFixed(1)} MB`);
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        log(`下载完成: ${(downloaded / (1024 * 1024)).toFixed(1)} MB`);
        resolve();
      });
    }).on('error', reject);
  });
}

function unzip(src, dest) {
  const platform = os.platform();
  log(`解压到 ${dest} ...`);

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });

  if (platform === 'win32') {
    const psScript = `Expand-Archive -Path "${src}" -DestinationPath "${dest}" -Force`;
    execSync(`powershell -Command "${psScript}"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -q -o "${src}" -d "${dest}"`, { stdio: 'inherit' });
  }
  log('解压完成');
}

/**
 * CyberChef 的 zip 中不含 index.html，入口为 CyberChef_v{version}.html。
 * 找到版本化 HTML 并复制为 index.html，Tauri 才能加载。
 */
function fixIndexHtml(distDir) {
  const entries = fs.readdirSync(distDir);
  const versioned = entries.find(f => /^CyberChef_v.+\.html$/.test(f));
  if (!versioned) {
    log('警告: 未找到 CyberChef_v*.html，可能影响 Tauri 加载');
    return;
  }
  const src = path.join(distDir, versioned);
  const dest = path.join(distDir, 'index.html');
  // 如果 index.html 已存在且是正确文件则跳过
  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, 'utf8').substring(0, 100);
    const source = fs.readFileSync(src, 'utf8').substring(0, 100);
    if (existing === source) return;
    fs.unlinkSync(dest);
  }
  fs.copyFileSync(src, dest);
  log(`index.html ← ${versioned}`);
}

async function main() {
  // 1. 获取最新 release (最多重试 3 次)
  log(`查询 ${REPO} 最新 release...`);
  const release = await withRetry(
    () => httpGetJson(`https://api.github.com/repos/${REPO}/releases/latest`),
    'API 查询',
    MAX_RETRIES
  );
  const tagName = release.tag_name;
  const version = tagName.replace(/^v/, '');

  // 2. 找到 zip 资源
  const zipAsset = release.assets.find(a => a.name.endsWith('.zip'));
  if (!zipAsset) {
    log('错误: 未找到 zip 资源');
    process.exit(1);
  }
  log(`找到版本: ${tagName}, zip: ${zipAsset.name} (${(zipAsset.size / (1024 * 1024)).toFixed(1)} MB)`);

  // 3. 检查是否已缓存
  if (fs.existsSync(VERSION_FILE) && fs.existsSync(DIST_DIR)) {
    const cachedVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    if (cachedVersion === tagName) {
      log(`已缓存版本 ${tagName}，跳过下载`);
      fixIndexHtml(DIST_DIR);
      console.log(version);
      return;
    }
    log(`版本不匹配 (缓存: ${cachedVersion}, 最新: ${tagName})，重新下载`);
  }

  // 4. 下载 zip (最多重试 3 次)
  await withRetry(
    () => downloadFile(zipAsset.browser_download_url, ZIP_PATH),
    '下载 zip',
    MAX_RETRIES
  );

  // 5. 解压
  unzip(ZIP_PATH, DIST_DIR);

  // 5b. CyberChef zip 不含 index.html，需从版本化 HTML 生成
  fixIndexHtml(DIST_DIR);

  // 6. 清理 zip
  fs.unlinkSync(ZIP_PATH);

  // 7. 写入版本文件
  fs.writeFileSync(VERSION_FILE, tagName + '\n');

  // 8. 输出版本号
  console.log(version);
  log(`完成! CyberChef ${tagName} 已就绪`);
}

main().catch((err) => {
  log(`失败 (已重试 ${MAX_RETRIES} 次): ${err.message}`);
  process.exit(1);
});
