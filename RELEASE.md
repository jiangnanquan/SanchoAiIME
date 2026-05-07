# 发版流程

每次发版执行以下步骤：

## 1. 版本号

```sh
# 修改所有 package.json 的 version 字段
find . -name "package.json" -not -path "*/node_modules/*" -exec sed -i '' 's/"version": "X\.Y\.Z"/"version": "NEW.VER.SION"/' {} \;
grep -r '"version"' packages/*/package.json package.json
```

## 2. 更新 README

检查 `README.md` 中的功能列表、版本引用是否需要更新。

## 3. 测试

```sh
npm test
# 确认全部通过
```

## 4. 构建 DMG

```sh
npm run menubar:package:mac
```

产物：

```text
dist/menubar-app/SanchoAiIME-arm64.dmg
```

## 5. 提交并打 tag

```sh
git add -A
git commit -m "Release vNEW.VER.SION"

git tag vNEW.VER.SION
git push origin main
git push origin vNEW.VER.SION
```

## 6. 创建 GitHub Release

```sh
gh release create vNEW.VER.SION \
  --title "SanchoAiIME vNEW.VER.SION" \
  --notes "发版说明..." \
  dist/menubar-app/SanchoAiIME-arm64.dmg
```

只上传 DMG，不上传 ZIP。

## 7. 验证

```sh
# 确认 release 页面可访问，DMG 可下载
gh release view vNEW.VER.SION
open "https://github.com/jiangnanquan/SanchoAiIME/releases/tag/vNEW.VER.SION"
```
