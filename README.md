# WARDOGS Artillery

面向 iPad Chrome 的 WARDOGS 非官方纯前端火炮计算与触控校射工具。支持 L81 MORTAR、SPH-2 高/低弹道、BAKURANI、OZETI、ZESTAFONA 社区地图、目标历史、实际落点迭代校射和 Terrain3D 相对高差 `ΔZ`。

在线版：<https://lucasz3214.github.io/wardogs-artillery/>

## 特性与边界

- 直接从社区 CDN 加载地图瓦片；浏览器不读取或导出 Canvas 像素。
- 状态保存在当前浏览器的 `wardogs-static-state-v1`，可用桌面版兼容的 `schema: 1` JSON 导入导出。
- 高程包只包含地图可作战区域，4 米采样、0.1 米量化并按区块懒加载。
- 只显示 `ΔZ = 目标高程 − 炮位高程`，不显示绝对海拔，也不自动修改密位。
- 不含后台、配对、WebSocket、电脑悬浮窗、TTS 或“下发”功能。

## 本地开发

```powershell
npm install
npm run dev
```

普通前端构建不要求先生成高程资产；缺少高程包时界面会显示 `ΔZ —`。生成并验证三张地图的作战区高程包：

```powershell
npm run terrain:build
npm run build
```

原始 Terrain3D 数据只下载到忽略的 `.terrain-source-cache`，不会提交仓库。GitHub Actions 会在部署时重新下载固定的 `assets-v1` 数据，验证原始区块长度与 SHA-256，再生成 Pages 资产。

## 双版本维护

共享功能必须与 Windows 本地版同步维护，详见 [docs/edition-sync.md](docs/edition-sync.md)。

## 数据来源与声明

地图瓦片与 Terrain3D 来源于 [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator)。高程限制参见其 [Terrain3D 说明](https://github.com/apollyon-sys/wardogs-calculator/blob/main/docs/terrain.md)，权属和再分发边界参见 [法律说明](https://github.com/apollyon-sys/wardogs-calculator/blob/main/docs/legal.md)。地图和 Terrain3D 派生数据不属于本项目代码许可证。

本项目是非官方社区工具，与 Team17、BULKHEAD 或 WARDOGS 无隶属或认可关系。程序不读取游戏内存、进程、截图或网络包，不注入游戏，也不模拟输入。
