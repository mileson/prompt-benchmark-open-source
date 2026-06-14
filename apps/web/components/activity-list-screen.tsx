'use client';

/*
## 核心功能
维护 activity-list-screen.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/components，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { ArrowRight, GearSix, MonitorPlay, Plus, QrCode, SpinnerGap, X } from '@phosphor-icons/react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { createActivity, patchSettings } from '@/lib/api';
import type { ActivityListItem, ParticipationMode } from '@/lib/types';

import styles from './activity-list-screen.module.css';

type Props = {
  initialActivities: ActivityListItem[];
  apiBaseUrl: string;
  loadError?: string | null;
};

const passwordStorageKey = 'prompt-benchmark-admin-password:activities';

const participationModeOptions: Array<{
  value: ParticipationMode;
  label: string;
  description: string;
}> = [
  {
    value: 'allowlist',
    label: '准入名单',
    description: '同学必须输入已导入名单中的名字。',
  },
  {
    value: 'anonymous',
    label: '匿名',
    description: '首次输入名字会创建同学，同名可继续操作。',
  },
];

function participationModeLabel(mode: ParticipationMode | undefined) {
  return mode === 'anonymous' ? '匿名' : '准入名单';
}

function participationModeDescription(mode: ParticipationMode | undefined) {
  return participationModeOptions.find((option) => option.value === mode)?.description ?? participationModeOptions[0].description;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间待确认';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status: ActivityListItem['status']) {
  if (status === 'live') {
    return '进行中';
  }

  if (status === 'archived') {
    return '已归档';
  }

  return '草稿';
}

export function ActivityListScreen({ initialActivities, apiBaseUrl, loadError = null }: Props) {
  const [activities, setActivities] = useState(initialActivities);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsActivity, setSettingsActivity] = useState<ActivityListItem | null>(null);
  const [title, setTitle] = useState('');
  const [participationMode, setParticipationMode] = useState<ParticipationMode>('allowlist');
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsParticipationMode, setSettingsParticipationMode] = useState<ParticipationMode>('allowlist');
  const [adminPassword, setAdminPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    loadError ? { tone: 'error', message: loadError } : null,
  );

  const totals = useMemo(
    () => activities.reduce(
      (next, activity) => ({
        participantCount: next.participantCount + activity.participantCount,
        submittedCount: next.submittedCount + activity.submittedCount,
        scoredCount: next.scoredCount + activity.scoredCount,
      }),
      { participantCount: 0, submittedCount: 0, scoredCount: 0 },
    ),
    [activities],
  );

  useEffect(() => {
    setAdminPassword(window.sessionStorage.getItem(passwordStorageKey) ?? '');
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTitle = title.trim();
    const nextPassword = adminPassword.trim();
    if (!nextTitle) {
      setNotice({ tone: 'error', message: '请输入活动名称。' });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const activity = await createActivity(apiBaseUrl, { title: nextTitle, participationMode }, nextPassword);
      window.sessionStorage.setItem(passwordStorageKey, nextPassword);
      setActivities((current) => [activity, ...current.filter((item) => item.id !== activity.id)]);
      setTitle('');
      setParticipationMode('allowlist');
      setDialogOpen(false);
      setNotice({ tone: 'success', message: `活动已创建，入口编号为 ${activity.slug}。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建活动失败';
      setNotice({ tone: 'error', message });
    } finally {
      setSaving(false);
    }
  }

  function openSettingsDialog(activity: ActivityListItem) {
    setSettingsActivity(activity);
    setSettingsTitle(activity.title);
    setSettingsParticipationMode(activity.participationMode ?? 'allowlist');
    setNotice(null);
  }

  async function handleUpdateSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settingsActivity) {
      return;
    }

    const nextTitle = settingsTitle.trim();
    const nextPassword = adminPassword.trim();
    if (!nextTitle) {
      setNotice({ tone: 'error', message: '请输入活动名称。' });
      return;
    }

    setSettingsSaving(true);
    setNotice(null);

    try {
      await patchSettings(
        apiBaseUrl,
        settingsActivity.id,
        { title: nextTitle, participationMode: settingsParticipationMode },
        nextPassword,
      );
      window.sessionStorage.setItem(passwordStorageKey, nextPassword);
      setActivities((current) => current.map((activity) => (
        activity.id === settingsActivity.id
          ? {
              ...activity,
              title: nextTitle,
              participationMode: settingsParticipationMode,
              updatedAt: new Date().toISOString(),
            }
          : activity
      )));
      setSettingsActivity(null);
      setSettingsTitle('');
      setSettingsParticipationMode('allowlist');
      setNotice({ tone: 'success', message: '活动设置已更新。' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新活动名称失败';
      setNotice({ tone: 'error', message });
    } finally {
      setSettingsSaving(false);
    }
  }

  return (
    <main className="pageShell">
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>活动列表</h1>
            <p className={styles.subtitle}>选择一场活动进入现场大屏、同学提交页或管理配置。</p>
          </div>
          <button type="button" className={styles.createButton} onClick={() => setDialogOpen(true)}>
            <Plus size={20} weight="bold" />
            新建活动
          </button>
        </header>

        <div className={styles.summaryGrid} aria-label="活动总览">
          <div className={styles.summaryItem}>
            <span>活动</span>
            <strong>{activities.length}</strong>
          </div>
          <div className={styles.summaryItem}>
            <span>同学</span>
            <strong>{totals.participantCount}</strong>
          </div>
          <div className={styles.summaryItem}>
            <span>已提交</span>
            <strong>{totals.submittedCount}</strong>
          </div>
          <div className={styles.summaryItem}>
            <span>已评分</span>
            <strong>{totals.scoredCount}</strong>
          </div>
        </div>

        {notice ? (
          <div className={`${styles.notice} ${styles[notice.tone]}`} role="status">
            {notice.message}
          </div>
        ) : null}

        <div className={styles.activityList}>
          {activities.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>还没有活动</h2>
              <p>创建第一场活动后，就可以导入名单并打开现场大屏。</p>
              <button type="button" className={styles.secondaryButton} onClick={() => setDialogOpen(true)}>
                <Plus size={18} weight="bold" />
                新建活动
              </button>
            </div>
          ) : activities.map((activity) => (
            <article key={activity.id} className={styles.activityCard}>
              <div className={styles.activityMain}>
                <div className={styles.activityMeta}>
                  <span className={`${styles.status} ${styles[activity.status]}`}>{statusLabel(activity.status)}</span>
                  <span className={styles.modePill}>{participationModeLabel(activity.participationMode)}</span>
                  <span>更新于 {formatDate(activity.updatedAt)}</span>
                </div>
                <h2>{activity.title}</h2>
                <p>/event/{activity.slug}</p>
              </div>

              <div className={styles.metrics} aria-label={`${activity.title} 数据`}>
                <div>
                  <span>同学</span>
                  <strong>{activity.participantCount}</strong>
                </div>
                <div>
                  <span>已提交</span>
                  <strong>{activity.submittedCount}</strong>
                </div>
                <div>
                  <span>已评分</span>
                  <strong>{activity.scoredCount}</strong>
                </div>
              </div>

              <div className={styles.actions}>
                <Link href={`/event/${activity.slug}`} className={styles.primaryLink}>
                  <MonitorPlay size={18} weight="bold" />
                  大屏
                  <ArrowRight size={16} weight="bold" />
                </Link>
                <Link
                  href={`/join/${activity.slug}`}
                  className={styles.iconLink}
                  aria-label={`打开 ${activity.title} 提交页`}
                  title="提交页"
                >
                  <QrCode size={19} weight="bold" />
                </Link>
                <button
                  type="button"
                  className={styles.iconLink}
                  aria-label={`编辑 ${activity.title} 活动设置`}
                  title="活动设置"
                  onClick={() => openSettingsDialog(activity)}
                >
                  <GearSix size={19} weight="bold" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {dialogOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="create-activity-title">
            <div className={styles.dialogHeader}>
              <div>
                <h2 id="create-activity-title">新建活动</h2>
                <p>保存后会生成独立的活动编号和数据空间。</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDialogOpen(false)} aria-label="关闭">
                <X size={20} weight="bold" />
              </button>
            </div>

            <form className={styles.form} onSubmit={(event) => void handleCreate(event)}>
              <label>
                <span>活动名称</span>
                <input
                  value={title}
                  maxLength={80}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：提示词培训第二场"
                  autoFocus
                />
              </label>
              <fieldset className={styles.modeGroup}>
                <legend>同学参加方式</legend>
                <div className={styles.segmentedControl}>
                  {participationModeOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`${styles.segmentedOption} ${participationMode === option.value ? styles.segmentedActive : ''}`}
                    >
                      <input
                        type="radio"
                        name="create-participation-mode"
                        value={option.value}
                        checked={participationMode === option.value}
                        onChange={() => setParticipationMode(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.modeHint}>{participationModeDescription(participationMode)}</p>
              </fieldset>
              <label>
                <span>管理密码（如已设置）</span>
                <input
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="留空后如需密码会提示"
                  type="password"
                />
              </label>

              <div className={styles.dialogActions}>
                <button type="button" className={styles.cancelButton} onClick={() => setDialogOpen(false)}>
                  取消
                </button>
                <button type="submit" className={styles.saveButton} disabled={saving}>
                  {saving ? <SpinnerGap size={18} weight="bold" className={styles.spinner} /> : <Plus size={18} weight="bold" />}
                  {saving ? '保存中' : '保存活动'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {settingsActivity ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="activity-settings-title">
            <div className={styles.dialogHeader}>
              <div>
                <h2 id="activity-settings-title">活动设置</h2>
                <p>修改活动名称后，列表、大屏和提交页会同步显示新名称。</p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setSettingsActivity(null)}
                aria-label="关闭"
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            <form className={styles.form} onSubmit={(event) => void handleUpdateSettings(event)}>
              <label>
                <span>活动名称</span>
                <input
                  value={settingsTitle}
                  maxLength={80}
                  onChange={(event) => setSettingsTitle(event.target.value)}
                  placeholder="例如：提示词培训第二场"
                  autoFocus
                />
              </label>
              <fieldset className={styles.modeGroup}>
                <legend>同学参加方式</legend>
                <div className={styles.segmentedControl}>
                  {participationModeOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`${styles.segmentedOption} ${settingsParticipationMode === option.value ? styles.segmentedActive : ''}`}
                    >
                      <input
                        type="radio"
                        name="settings-participation-mode"
                        value={option.value}
                        checked={settingsParticipationMode === option.value}
                        onChange={() => setSettingsParticipationMode(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.modeHint}>{participationModeDescription(settingsParticipationMode)}</p>
              </fieldset>
              <label>
                <span>管理密码（如已设置）</span>
                <input
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="留空后如需密码会提示"
                  type="password"
                />
              </label>

              <div className={styles.settingsLinkRow}>
                <Link href={`/event/${settingsActivity.slug}/manage`} className={styles.manageLink}>
                  进入管理配置
                  <ArrowRight size={16} weight="bold" />
                </Link>
              </div>

              <div className={styles.dialogActions}>
                <button type="button" className={styles.cancelButton} onClick={() => setSettingsActivity(null)}>
                  取消
                </button>
                <button type="submit" className={styles.saveButton} disabled={settingsSaving}>
                  {settingsSaving ? (
                    <SpinnerGap size={18} weight="bold" className={styles.spinner} />
                  ) : (
                    <GearSix size={18} weight="bold" />
                  )}
                  {settingsSaving ? '保存中' : '保存设置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
