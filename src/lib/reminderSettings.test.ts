import { describe, expect, it } from 'vitest'
import { alarmNote, DEFAULT_REMINDERS, formFromProfile, isHm, profilePatch, toHm, validateReminders, type ReminderForm } from './reminderSettings'

const f = (o: Partial<ReminderForm> = {}): ReminderForm => ({ ...DEFAULT_REMINDERS, ...o })

describe('time helpers', () => {
  it('toHm trims seconds and falls back', () => {
    expect(toHm('09:30:00', '00:00')).toBe('09:30')
    expect(toHm(null, '08:00')).toBe('08:00')
    expect(toHm('', '08:00')).toBe('08:00')
  })
  it('isHm accepts 24-hour times only', () => {
    for (const ok of ['00:00', '09:05', '23:59']) expect(isHm(ok), ok).toBe(true)
    for (const bad of ['24:00', '9:00', '09:60', '', 'ab:cd', '09:00:00']) expect(isHm(bad), bad).toBe(false)
  })
})

describe('formFromProfile / profilePatch', () => {
  it('reads database values (with seconds) and defaults for a missing profile', () => {
    expect(formFromProfile(null)).toEqual(DEFAULT_REMINDERS)
    expect(formFromProfile({ alarm_time: '07:30:00', quiet_from: '23:00:00', quiet_until: '06:00:00', summary_mode: 'weekly', summary_time: '19:00:00', summary_weekday: 0 }))
      .toEqual({ alarm: '07:30', quietOn: true, quietFrom: '23:00', quietUntil: '06:00', summary: 'weekly', summaryTime: '19:00', summaryWeekday: 0 })
    expect(formFromProfile({ quiet_from: '23:00:00', quiet_until: null, summary_mode: 'nonsense' })).toMatchObject({ quietOn: false, summary: 'off' })
  })
  it('writes null quiet hours when off and a weekday only for weekly', () => {
    expect(profilePatch(f())).toEqual({ alarm_time: '09:00', quiet_from: null, quiet_until: null, summary_mode: 'off', summary_time: '08:00', summary_weekday: null })
    expect(profilePatch(f({ quietOn: true, summary: 'weekly', summaryWeekday: 5 }))).toMatchObject({ quiet_from: '22:00', quiet_until: '07:00', summary_mode: 'weekly', summary_weekday: 5 })
    expect(profilePatch(f({ summary: 'daily', summaryWeekday: 5 })).summary_weekday).toBeNull()
  })
})

describe('validateReminders', () => {
  it('accepts the defaults, wrapping quiet hours and weekly summaries', () => {
    expect(validateReminders(f())).toEqual({})
    expect(validateReminders(f({ quietOn: true, quietFrom: '22:00', quietUntil: '07:00' }))).toEqual({})
    expect(validateReminders(f({ summary: 'weekly', summaryWeekday: 0 }))).toEqual({})
  })
  it('explains what is wrong', () => {
    expect(validateReminders(f({ alarm: '' }))).toEqual({ alarm: 'Choose a time' })
    expect(validateReminders(f({ quietOn: true, quietFrom: '', quietUntil: '25:00' }))).toEqual({ quietFrom: 'Choose a time', quietUntil: 'Choose a time' })
    expect(validateReminders(f({ quietOn: true, quietFrom: '22:00', quietUntil: '22:00' }))).toEqual({ quietUntil: 'Quiet hours need a start and an end that differ' })
    expect(validateReminders(f({ summary: 'daily', summaryTime: 'x' }))).toEqual({ summaryTime: 'Choose a time' })
    expect(validateReminders(f({ summary: 'weekly', summaryWeekday: 9 }))).toEqual({ summaryWeekday: 'Choose a day' })
  })
  it('ignores hidden fields: quiet times when off, summary fields when off', () => {
    expect(validateReminders(f({ quietOn: false, quietFrom: '', quietUntil: '' }))).toEqual({})
    expect(validateReminders(f({ summary: 'off', summaryTime: '', summaryWeekday: 99 }))).toEqual({})
  })
})

describe('alarmNote (mirrors the server)', () => {
  it('nothing to say outside quiet hours or when they are off', () => {
    expect(alarmNote(f())).toBeNull()
    expect(alarmNote(f({ quietOn: true }))).toBeNull() // 09:00 is outside 22:00-07:00
    expect(alarmNote(f({ quietOn: true, quietFrom: '22:00', quietUntil: '22:00' }))).toBeNull()
  })
  it('inside the morning part of a wrapping window: waits until it ends', () => {
    expect(alarmNote(f({ alarm: '06:00', quietOn: true }))).toBe('06:00 is inside quiet hours, so reminders will arrive at 07:00 instead.')
  })
  it('inside the evening part of a wrapping window: would be skipped', () => {
    expect(alarmNote(f({ alarm: '23:00', quietOn: true }))).toMatch(/skipped/)
  })
  it('inside a same-day window: waits until it ends', () => {
    expect(alarmNote(f({ alarm: '13:00', quietOn: true, quietFrom: '12:00', quietUntil: '14:00' }))).toBe('13:00 is inside quiet hours, so reminders will arrive at 14:00 instead.')
  })
})
