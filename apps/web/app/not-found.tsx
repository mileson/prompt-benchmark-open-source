/*
## 核心功能
维护 not-found.tsx 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/app，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="pageShell" style={{ display: 'grid', placeItems: 'center' }}>
      <div
        className="glass"
        style={{
          width: 'min(640px, 100%)',
          borderRadius: 28,
          padding: '38px 42px',
          display: 'grid',
          gap: 16,
        }}
      >
        <div className="pill">没有找到对应活动</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700 }}>
          这个活动链接可能已经失效了
        </div>
        <div style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
          你可以回到首页重新进入，或者请讲师重新分享正确的活动链接。
        </div>
        <Link
          href="/"
          style={{
            width: 'fit-content',
            padding: '12px 18px',
            borderRadius: 999,
            background: 'linear-gradient(120deg, rgba(114,255,207,0.88), rgba(136,240,255,0.88))',
            color: '#041019',
            fontWeight: 700,
          }}
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
