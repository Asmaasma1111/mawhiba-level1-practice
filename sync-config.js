/* sync-config.js — إعدادات المزامنة بين الأجهزة.
   املئي القيمتين أدناه بعد إنشاء مشروع Supabase وتشغيل ملف supabase/sync-setup.sql.
   إن بقيتا فارغتين يعمل التطبيق كما هو تماماً، ويُحفظ التقدّم على الجهاز فقط.

   ملاحظة أمنية: المفتاح المطلوب هنا هو anon key وهو مفتاح علنيّ بطبيعته
   (يظهر في أيّ تطبيق ويب يستعمل Supabase). لا تضعي هنا service_role key أبداً. */

window.MW_SYNC_CONFIG = {
  url: '',      // مثال: https://xxxxxxxxxxxxxxxxxxxx.supabase.co
  anonKey: ''   // anon / publishable key
};
