import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.moneyflow.iexpense',
  appName: 'Money Flow',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      iconColor: '#c9f06c',
    },
  },
}

export default config
