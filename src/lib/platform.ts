import { Capacitor } from '@capacitor/core'

export const isAndroid = Capacitor.getPlatform() === 'android'
export const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
export const isMock = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock')
export const multiThread = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
