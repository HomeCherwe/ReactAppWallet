import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, Download, ExternalLink, Laptop, RefreshCw, Smartphone, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import BaseModal from './BaseModal'
import {
  IOS_BUILDS_URL,
  IOS_IPA_URL,
  ILOADER_URL,
  ITUNES_URL,
  LOCALDEVVPN_URL,
  SIDESTORE_URL,
  isIPhoneBrowser,
  markIosAppInstalled,
  useIosAppStatus,
  useLatestIosBuild,
} from '../utils/iosApp'

const link = 'text-brand font-semibold inline-flex items-center gap-0.5 hover:underline'
const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className={link} onClick={e => e.stopPropagation()}>
    {children} <ExternalLink size={12} />
  </a>
)

// The way it's done in practice: the computer is needed once, to put SideStore on the iPhone;
// after that MyWallet is installed and refreshed right on the phone (SideStore + LocalDevVPN)
const STEPS = [
  {
    title: 'Завантажте файл додатку',
    short: 'Кнопка вище — MyWallet.ipa, завжди найновіша збірка.',
    details: (
      <>
        <li>Найзручніше — прямо на iPhone у Safari: файл збережеться у «Файли → Завантаження».</li>
        <li>Якщо завантажили на комп’ютер — перекиньте файл на iPhone (AirDrop, iCloud Drive, Telegram у «Збережене»).</li>
        <li>Він знадобиться на кроці 9, коли SideStore уже стоятиме на телефоні.</li>
      </>
    ),
  },
  {
    title: 'Встановіть iTunes на комп’ютер',
    short: (
      <>
        Для Windows: <A href={ITUNES_URL}>iTunes з сайту Apple</A>. На Mac не потрібно.
      </>
    ),
    details: (
      <>
        <li>Завантажте й встановіть iTunes за посиланням вище (або з Microsoft Store — теж підходить).</li>
        <li>Входити в iTunes не потрібно: він лише дає комп’ютеру «бачити» iPhone по кабелю.</li>
      </>
    ),
  },
  {
    title: 'Встановіть iLoader на комп’ютер',
    short: (
      <>
        <A href={ILOADER_URL}>iloader.app</A> — для Windows, Mac і Linux.
      </>
    ),
    details: (
      <>
        <li>Завантажте інсталятор для своєї системи (для Windows — MSI або EXE) і встановіть.</li>
        <li>Качайте тільки з iloader.app або його GitHub — інших офіційних джерел немає.</li>
      </>
    ),
  },
  {
    title: 'Підключіть iPhone кабелем',
    short: 'Розблокуйте телефон і натисніть «Довіряти цьому комп’ютеру».',
    details: (
      <>
        <li>Введіть код-пароль iPhone, якщо попросить.</li>
        <li>Телефон має лишатися розблокованим і підключеним, поки iLoader не закінчить.</li>
      </>
    ),
  },
  {
    title: 'Поставте SideStore через iLoader',
    short: (
      <>
        Увійдіть в iLoader з Apple ID → виберіть iPhone → <b>Install SideStore</b>. З{' '}
        <A href={SIDESTORE_URL}>SideStore</A> потім ставиться MyWallet.
      </>
    ),
    details: (
      <>
        <li>
          Відкрийте iLoader і увійдіть своїм Apple ID (<b>Sign in</b>). Пароль і код підтвердження йдуть тільки до Apple.
        </li>
        <li>Виберіть свій iPhone у списку пристроїв.</li>
        <li>
          Натисніть <b>Install SideStore (Stable)</b> і дочекайтесь, поки встановлення завершиться. Сертифікат і pairing
          file iLoader додає сам.
        </li>
        <li>Далі комп’ютер уже не потрібен — усе робиться на телефоні.</li>
      </>
    ),
  },
  {
    title: 'Довіртеся розробнику',
    short: 'Параметри → Загальні → VPN і керування пристроями.',
    details: (
      <>
        <li>У розділі «Програма розробника» виберіть свій Apple ID.</li>
        <li>Натисніть «Довіряти …» і підтвердіть.</li>
      </>
    ),
  },
  {
    title: 'Увімкніть режим розробника',
    short: 'Параметри → Приватність і безпека → Режим розробника.',
    details: (
      <>
        <li>Пункт у самому низу розділу — він з’являється після встановлення SideStore.</li>
        <li>Увімкніть, iPhone перезавантажиться. Після перезавантаження підтвердіть «Увімкнути» і введіть код-пароль.</li>
      </>
    ),
  },
  {
    title: 'Встановіть LocalDevVPN',
    short: (
      <>
        <A href={LOCALDEVVPN_URL}>LocalDevVPN з App Store</A> — через нього SideStore ставить і оновлює додатки.
      </>
    ),
    details: (
      <>
        <li>Відкрийте LocalDevVPN і натисніть <b>Connect</b>, дозвольте додати VPN.</li>
        <li>Він нічого не шифрує й нікуди не відправляє — потрібен лише, щоб SideStore «говорив» з самим iPhone.</li>
        <li>Вмикайте його щоразу, коли встановлюєте або оновлюєте додатки в SideStore.</li>
      </>
    ),
  },
  {
    title: 'Встановіть MyWallet через SideStore',
    short: 'SideStore → увійдіть з Apple ID → My Apps → «+» → MyWallet.ipa.',
    details: (
      <>
        <li>Відкрийте SideStore і увійдіть тим самим Apple ID, що в iLoader.</li>
        <li>У вкладці <b>My Apps</b> натисніть <b>SideStore «7 DAYS»</b>, щоб оновити його підпис, і прийміть запити.</li>
        <li>Натисніть <b>«+»</b> угорі й виберіть MyWallet.ipa з «Файли → Завантаження». Дочекайтесь встановлення.</li>
        <li>
          Якщо SideStore пише про pairing file — підключіть iPhone до комп’ютера і ще раз поставте SideStore через
          iLoader: він оновить цей файл.
        </li>
      </>
    ),
  },
  {
    title: 'Відкрийте MyWallet',
    short: 'Увійдіть тим самим Google-акаунтом — усі картки й транзакції вже там.',
    details: null,
  },
]

function StepRow({ step, index, open, onToggle }) {
  return (
    <li>
      {/* A div, not a button: the short text can hold links */}
      <div
        role={step.details ? 'button' : undefined}
        tabIndex={step.details ? 0 : undefined}
        aria-expanded={step.details ? open : undefined}
        onClick={step.details ? onToggle : undefined}
        onKeyDown={step.details ? (e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())) : undefined}
        className={`w-full flex gap-3 px-3.5 py-3 text-left ${step.details ? 'hover:bg-white/[0.03] cursor-pointer' : ''}`}
      >
        <span className="h-7 w-7 shrink-0 rounded-full bg-brand/15 text-orange-300 text-sm font-bold grid place-items-center">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-white">{step.title}</span>
          <span className="block text-[13px] text-white/60 mt-0.5 leading-snug">{step.short}</span>
        </span>
        {step.details && (
          <ChevronDown size={18} className={`shrink-0 mt-1 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && step.details && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="ml-[52px] mr-3.5 mb-3 grid gap-1.5 text-[13px] text-white/70 leading-snug list-disc pl-4 marker:text-brand/70">
              {step.details}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

/** "MyWallet для iPhone": how to install the app (SideStore) and where to get the newest build */
export default function IosAppGuide({ open, onClose }) {
  // "installed" = the app reported itself within the last 2 weeks; "stale" = it used to, then went quiet
  const { iosApp, active: installed, stale, daysSince } = useIosAppStatus()
  const onIPhone = isIPhoneBrowser()
  const [openStep, setOpenStep] = useState(null)
  // The iPhone app writes when its 7-day signature runs out (preferences.iosApp.signatureExpiresAt)
  const signatureLeft = (() => {
    const expires = iosApp?.signatureExpiresAt ? new Date(iosApp.signatureExpiresAt) : null
    if (!expires || isNaN(expires)) return null
    const hours = (expires - Date.now()) / 36e5
    const when = expires.toLocaleString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    if (hours <= 0) return { soon: true, text: `Підпис закінчився ${when} — оновіть його в SideStore` }
    return { soon: hours <= 36, text: `Підпис дійсний ${iosApp.signatureEstimated ? 'приблизно ' : ''}до ${when}` }
  })()
  // undefined while checking, null until the first build is published to the release
  const build = useLatestIosBuild(open)
  const buildInfo = build
    ? [
        build.title,
        `оновлено ${new Date(build.updatedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}`,
        `${(build.size / 1024 / 1024).toFixed(0)} МБ`,
      ].join(' · ')
    : build === null
    ? 'Збірка ще публікується — поки що: остання збірка → Artifacts (потрібен акаунт GitHub)'
    : 'Перевіряємо останню збірку…'

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      maxWidth="lg"
      zIndex={100}
      title={
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-[14px] bg-gradient-to-br from-brand to-brand-deep grid place-items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
            <Wallet size={24} className="text-white" />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight">MyWallet для iPhone</div>
            <div className="text-xs text-white/55">Той самий акаунт і дані, що на сайті</div>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        {installed && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-green-500/10 border border-green-500/25 px-3.5 py-3 text-sm">
            <CheckCircle2 size={18} className="text-green-400 shrink-0 mt-px" />
            <div>
              <div className="font-semibold text-green-300">Додаток уже встановлено{iosApp?.version ? ` · версія ${iosApp.version}` : ''}</div>
              {signatureLeft && (
                <div className={`text-xs mt-0.5 font-semibold ${signatureLeft.soon ? 'text-orange-300' : 'text-white/70'}`}>
                  {signatureLeft.text}
                </div>
              )}
              <div className="text-white/55 text-xs mt-0.5">Нову збірку можна завантажити тут у будь-який момент.</div>
            </div>
          </div>
        )}

        {stale && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-white/[0.05] border border-white/10 px-3.5 py-3 text-sm">
            <Smartphone size={18} className="text-brand shrink-0 mt-px" />
            <div>
              <div className="font-semibold text-white">
                MyWallet на iPhone {daysSince != null ? `не відкривався ${daysSince} дн.` : 'давно не відкривався'}
              </div>
              <div className="text-white/55 text-xs mt-0.5">
                Якщо ви його видалили або підпис закінчився — встановіть знову за кроками нижче.
              </div>
            </div>
          </div>
        )}

        {onIPhone && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-white/[0.05] border border-white/10 px-3.5 py-3 text-sm">
            <Laptop size={18} className="text-brand shrink-0 mt-px" />
            <div className="text-white/75">
              Комп’ютер потрібен один раз — поставити SideStore (кроки 2–5). MyWallet.ipa можна завантажити прямо тут, на
              iPhone.
            </div>
          </div>
        )}

        <div>
          <a
            href={build === null ? IOS_BUILDS_URL : IOS_IPA_URL}
            target={build === null ? '_blank' : undefined}
            rel="noreferrer"
            className="btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Завантажити MyWallet.ipa
          </a>
          <p className="text-[11px] text-white/40 text-center mt-1.5">{buildInfo}</p>
        </div>

        <ol className="rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] divide-y divide-white/[0.06]">
          {STEPS.map((step, i) => (
            <StepRow
              key={step.title}
              step={step}
              index={i}
              open={openStep === i}
              onToggle={() => setOpenStep(o => (o === i ? null : i))}
            />
          ))}
        </ol>

        <div className="text-xs font-bold uppercase tracking-[0.05em] text-white/55 px-1 -mb-2">Після встановлення</div>

        {/* Most updates: nothing to do */}
        <div className="flex items-start gap-2.5 rounded-2xl bg-green-500/10 border border-green-500/25 px-3.5 py-3 text-[13px] text-white/75">
          <RefreshCw size={18} className="text-green-400 shrink-0 mt-px" />
          <div>
            <div className="text-[15px] font-semibold text-green-300">Оновлення приходять самі</div>
            Нові функції й виправлення додаток завантажує сам, коли ви його відкриваєте. Нічого робити не треба.
          </div>
        </div>

        {/* Every 7 days: re-sign from the phone */}
        <div className="flex items-start gap-2.5 rounded-2xl bg-brand/[0.08] border border-brand/25 px-3.5 py-3 text-[13px] text-white/75">
          <Smartphone size={18} className="text-brand shrink-0 mt-px" />
          <div>
            <div className="text-[15px] font-semibold text-white">Раз на 7 днів — продовжити підпис</div>
            Безкоштовний Apple ID підписує додаток на 7 днів. Увімкніть LocalDevVPN → відкрийте SideStore → My Apps →
            натисніть «7 DAYS» біля MyWallet. Комп’ютер не потрібен, дані не зникнуть.
          </div>
        </div>

        {/* Rarely: a new build has to be installed by hand */}
        <div className="flex items-start gap-2.5 rounded-2xl bg-white/[0.04] border border-white/10 px-3.5 py-3 text-[13px] text-white/75">
          <Download size={18} className="text-white/60 shrink-0 mt-px" />
          <div>
            <div className="text-[15px] font-semibold text-white">Зрідка — нова збірка вручну</div>
            Інколи оновлення не може прийти само, і потрібен новий файл. Тоді:
            <ol className="list-decimal pl-4 mt-1.5 grid gap-0.5 marker:text-white/40">
              <li>Завантажте MyWallet.ipa кнопкою вгорі — там завжди найновіша збірка (дата під кнопкою).</li>
              <li>Увімкніть LocalDevVPN, відкрийте SideStore → My Apps → «+» і виберіть цей файл.</li>
              <li>Він встановиться поверх старого — картки, транзакції й вхід залишаться.</li>
            </ol>
          </div>
        </div>

        {!installed && (
          <button
            type="button"
            onClick={() => {
              markIosAppInstalled()
              toast.success('Готово! Більше не нагадуватимемо')
              onClose()
            }}
            className="h-11 rounded-2xl bg-white/[0.05] border border-white/10 text-sm font-semibold text-white/80 hover:bg-white/[0.08] transition-colors"
          >
            У мене вже є додаток
          </button>
        )}
      </div>
    </BaseModal>
  )
}
