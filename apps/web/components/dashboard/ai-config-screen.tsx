/*
## 核心功能
维护 ai-config-screen.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/components/dashboard，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeSlash } from '@phosphor-icons/react';

import {
  getActivityAiConfig,
  patchActivityAiConfig,
  revealActivityAiKey,
  testActivityAiConfig,
} from '@/lib/api';
import type { ActivityAiConfig, ActivitySummary } from '@/lib/types';

import styles from './ai-config-screen.module.css';

type Props = {
  activity: ActivitySummary;
  apiBaseUrl: string;
};

type NoticeState = {
  tone: 'success' | 'error';
  message: string;
} | null;

function isAdminPasswordError(message: string) {
  return message.includes('管理密码');
}

function describeConfigStatus(config: ActivityAiConfig | null) {
  if (!config) {
    return '未配置';
  }

  if (config.hasStoredApiKey) {
    return '已配置';
  }

  if (config.hasFallbackApiKey) {
    return '已配置（系统默认）';
  }

  return '未配置';
}

export function AiConfigScreen({ activity, apiBaseUrl }: Props) {
  const passwordStorageKey = useMemo(
    () => `prompt-benchmark-admin-password:${activity.id}`,
    [activity.id],
  );
  const [config, setConfig] = useState<ActivityAiConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    const storedPassword = window.sessionStorage.getItem(passwordStorageKey) ?? '';
    setAdminPassword(storedPassword);

    const pull = async () => {
      try {
        const next = await getActivityAiConfig(apiBaseUrl, activity.id, storedPassword || undefined);
        if (cancelled) {
          return;
        }

        applyConfig(next);
        setRequiresPassword(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : '读取 AI 配置失败';
        if (isAdminPasswordError(message)) {
          window.sessionStorage.removeItem(passwordStorageKey);
          setRequiresPassword(true);
        } else {
          setNotice({ tone: 'error', message });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void pull();

    return () => {
      cancelled = true;
    };
  }, [activity.id, apiBaseUrl, passwordStorageKey]);

  function applyConfig(next: ActivityAiConfig) {
    setConfig(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setApiKeyValue(next.apiKeyMasked ?? '');
    setApiKeyDirty(false);
    setShowApiKey(false);
  }

  async function loadWithPassword(password: string) {
    setUnlocking(true);
    try {
      const next = await getActivityAiConfig(apiBaseUrl, activity.id, password);
      window.sessionStorage.setItem(passwordStorageKey, password);
      setAdminPassword(password);
      applyConfig(next);
      setRequiresPassword(false);
      setNotice({ tone: 'success', message: '管理页已解锁。' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取 AI 配置失败';
      setNotice({ tone: 'error', message });
      setRequiresPassword(true);
    } finally {
      setUnlocking(false);
    }
  }

  async function handleRevealToggle() {
    if (showApiKey) {
      setShowApiKey(false);
      if (!apiKeyDirty) {
        setApiKeyValue(config?.apiKeyMasked ?? '');
      }
      return;
    }

    if (config?.hasStoredApiKey && !apiKeyDirty) {
      setRevealing(true);
      try {
        const result = await revealActivityAiKey(apiBaseUrl, activity.id, adminPassword || undefined);
        setApiKeyValue(result.apiKey);
      } catch (error) {
        setNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : '读取 API Key 失败',
        });
        return;
      } finally {
        setRevealing(false);
      }
    }

    setShowApiKey(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const next = await patchActivityAiConfig(
        apiBaseUrl,
        activity.id,
        {
          baseUrl,
          model,
          apiKeyChanged: apiKeyDirty,
          ...(apiKeyDirty ? { apiKey: apiKeyValue } : {}),
        },
        adminPassword || undefined,
      );
      applyConfig(next);
      setNotice({ tone: 'success', message: 'AI 配置已保存。' });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : '保存 AI 配置失败',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const result = await testActivityAiConfig(
        apiBaseUrl,
        activity.id,
        {
          baseUrl,
          model,
          ...(apiKeyDirty ? { apiKey: apiKeyValue } : {}),
        },
        adminPassword || undefined,
      );
      setNotice({
        tone: 'success',
        message: result.preview ? `测试成功：${result.preview}` : result.message,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : '测试连接失败',
      });
    } finally {
      setTesting(false);
    }
  }

  const statusText = describeConfigStatus(config);
  const useMaskedStoredValue = !showApiKey && !apiKeyDirty && Boolean(config?.hasStoredApiKey);
  const keyFieldValue = useMaskedStoredValue ? (config?.apiKeyMasked ?? '') : apiKeyValue;
  const keyFieldType = useMaskedStoredValue ? 'text' : (showApiKey ? 'text' : 'password');

  return (
    <main className="pageShell">
      <section className={styles.shell}>
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <Link href={`/event/${activity.slug}`} className={styles.backButton}>
              <ArrowLeft size={18} weight="bold" />
              <span>返回大屏</span>
            </Link>
            <div className={styles.headerCopy}>
              <div className={styles.eyebrow}>活动管理</div>
              <h1 className={styles.title}>AI配置</h1>
              <p className={styles.subtitle}>{activity.title}</p>
            </div>
          </div>
        </div>

        {notice ? (
          <section className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : styles.noticeSuccess}`}>
            {notice.message}
          </section>
        ) : null}

        {loading ? (
          <section className={styles.panel}>
            <div className={styles.loading}>正在读取配置…</div>
          </section>
        ) : requiresPassword && !config ? (
          <section className={styles.panel}>
            <div className={styles.authCard}>
              <div className={styles.authTitle}>输入管理密码</div>
              <input
                className={styles.input}
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="管理密码"
              />
              <button
                type="button"
                className={styles.primaryButton}
                disabled={unlocking || adminPassword.trim().length === 0}
                onClick={() => void loadWithPassword(adminPassword.trim())}
              >
                {unlocking ? '验证中…' : '进入管理页'}
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.panel}>
            <div className={styles.grid}>
              <div className={styles.fieldBlock}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>模式</span>
                  <span className={styles.modeValue}>标准模式</span>
                </div>
              </div>

              <div className={styles.fieldBlock}>
                <label className={styles.label} htmlFor="ai-base-url">Base URL</label>
                <input
                  id="ai-base-url"
                  className={styles.input}
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </div>

              <div className={styles.fieldBlock}>
                <label className={styles.label} htmlFor="ai-model">Model</label>
                <input
                  id="ai-model"
                  className={styles.input}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </div>

              <div className={styles.fieldBlock}>
                <label className={styles.label} htmlFor="ai-api-key">API Key</label>
                <div className={styles.secretRow}>
                  <input
                    id="ai-api-key"
                    className={styles.input}
                    type={keyFieldType}
                    value={keyFieldValue}
                    onChange={(event) => {
                      setApiKeyDirty(true);
                      setApiKeyValue(event.target.value);
                    }}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={revealing}
                    onClick={() => void handleRevealToggle()}
                    aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  >
                    {showApiKey ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
                  </button>
                </div>
              </div>

              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>状态</span>
                <span className={styles.statusValue}>{statusText}</span>
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={testing || saving}
                onClick={() => void handleTest()}
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={saving || testing}
                onClick={() => void handleSave()}
              >
                {saving ? '保存中…' : '保存配置'}
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
