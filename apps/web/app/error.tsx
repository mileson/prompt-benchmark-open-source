/*
## 核心功能
维护 error.tsx 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

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
'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="pageShell" style={{ display: 'grid', placeItems: 'center' }}>
      <div
        className="glass"
        style={{
          width: 'min(620px, 100%)',
          borderRadius: 28,
          padding: '36px 40px',
          display: 'grid',
          gap: 16,
        }}
      >
        <div className="pill" style={{ color: '#ffd2d8' }}>
          页面暂时不可用
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700 }}>
          这块内容刚刚没有加载成功
        </div>
        <div style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
          你可以重新试一次。如果问题持续存在，稍后再打开也可以。
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            width: 'fit-content',
            padding: '12px 18px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--text)',
          }}
        >
          重新加载
        </button>
      </div>
    </main>
  );
}
