# WARDOGS Artillery

WARDOGS 非官方纯前端火炮计算器，针对 iPad Chrome 触控操作设计。

在线使用：<https://lucasz3214.github.io/wardogs-artillery/>

## 功能

- L81 MORTAR 与 SPH-2 高、低弹道计算
- BAKURANI、OZETI、ZESTAFONA 社区地图、灰度/彩色图层与地标
- 炮位、目标、实际落点和多次迭代校射
- 直径 1100 m 的圆形 Control Zone，可放置/拖动圆心或用两个圆边点定位，并可翻转镜像解
- 目标历史、撤销、删除及 JSON 导入导出
- 单指平移、双指缩放、准星拖动和全屏布局
- 4 米作战区 Terrain3D 相对高差 `ΔZ`

所有操作和历史保存在当前浏览器。`ΔZ` 只供参考，不显示绝对海拔，也不参与密位计算。

## 数据来源与声明

支持[可切换等高线](docs/contours.md)：随缩放使用 10 / 5 / 2 米等高距，彩色底图采用深紫灰线条。彩色底图饱和度为 65%，不额外调整亮度和对比度。

地图与 Terrain3D 数据来源于 [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator)。地图、游戏素材与 Terrain3D 派生数据不属于本项目代码许可证。

本项目是非官方社区工具，与 Team17、BULKHEAD 或 WARDOGS 无隶属或认可关系。
