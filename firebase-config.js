/* ==========================================================
   Настройки Firebase — общее хранилище данных для вас и друга.

   1. Зайдите на https://console.firebase.google.com
   2. Создайте проект (бесплатно, без карты).
   3. В проекте: Build → Firestore Database → Create database →
      выберите режим "Start in test mode" (потом настроим правила ниже).
   4. Слева: ⚙ Project settings → вкладка "General" → внизу
      "Your apps" → нажмите иконку "</>" (Web) → зарегистрируйте
      приложение → скопируйте объект firebaseConfig и вставьте вместо
      значений ниже.
   ========================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDsQWGkKW69EZQHl8KikoVEACFJnMMahI4",
  authDomain: "oreboard-f437c.firebaseapp.com",
  projectId: "oreboard-f437c",
  storageBucket: "oreboard-f437c.firebasestorage.app",
  messagingSenderId: "881165868588",
  appId: "1:881165868588:web:5d23f5e02858c67e413b89",
};

/* Необязательный лёгкий PIN-код на вход в сайт.
   Это НЕ настоящая защита данных (любой, кто откроет код сайта,
   технически может её обойти) — просто барьер от случайных людей,
   которые угадают адрес сайта. Настоящая защита данных настраивается
   в Firestore Rules (см. README).
   Оставьте пустую строку '', если PIN не нужен. */
const ACCESS_PIN = "1234";
