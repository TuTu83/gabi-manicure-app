export default defineAppConfig({
  pages: [
    'pages/splash/index',
    'pages/auth/login/index',
    'pages/auth/register/index',
    'pages/auth/forgot/index',
    'pages/index/index',
    'pages/booking/index',
    'pages/profile/index',
    'pages/admin/index',
    'pages/debug-push/index',
    'pages/negotiation-detail/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'Agendar Manicure Gabriele',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#7a7386',
    selectedColor: '#e8558f',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: 'Início'
      },
      {
        pagePath: 'pages/booking/index',
        text: 'Agendar'
      },
      {
        pagePath: 'pages/admin/index',
        text: 'Admin'
      },
      {
        pagePath: 'pages/profile/index',
        text: 'Perfil'
      }
    ]
  }
})
