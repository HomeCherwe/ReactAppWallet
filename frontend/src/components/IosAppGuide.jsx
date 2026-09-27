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
  SIDELOADLY_URL,
  SIDESTORE_URL,
  isIPhoneBrowser,
  markIosAppInstalled,
  useIosApp,
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
        <li>Завантажте й встановіть iTunes за посиланням вище — саме з сайту Apple, версія з Microsoft Store не підходить.</li>
        <li>Входити в iTunes не потрібно: він лише дає комп’ютеру «бачити» iPhone по кабелю.</li>
        <li>
          Якщо Sideloadly напише, що бракує iCloud, — встановіть і його, теж з сайту Apple (посилання є на{' '}
          <A href={SIDELOADLY_URL}>sideloadly.io</A>). Входити в iCloud теж не треба.
        </li>
      </>
    ),
  },
  {
    title: 'Встановіть Sideloadly на комп’ютер',
    short: (
      <>
        <A href={SIDELOADLY_URL}>sideloadly.io</A> — для Windows і Mac.
      </>
    ),
    details: (
      <>
        <li>Завантажте версію для своєї системи і встановіть.</li>
        <li>Відкрийте Sideloadly — у полі <b>Apple account</b> введіть свій Apple ID. Це єдине місце на комп’ютері, де він потрібен.</li>
        <li>Пароль і код підтвердження вводяться тут же — вони йдуть тільки до Apple.</li>
      </>
    ),
  },
  {
    title: 'Підключіть iPhone кабелем',
    short: 'Розблокуйте телефон і натисніть «Довіряти цьому комп’ютеру».',
    details: (
      <>
        <li>Введіть код-пароль iPhone, якщо попросить.</li>
        <li>У Sideloadly зверху має з’явитися назва вашого iPhone.</li>
      </>
    ),
  },
  {
    title: 'Поставте SideStore на iPhone',
    short: (
      <>
        У Sideloadly є кнопка встановлення <A href={SIDESTORE_URL}>SideStore</A> — з нього потім ставиться MyWallet.
      </>
    ),
    details: (
      <>
        <li>У Sideloadly перевірте, що вибрано ваш iPhone і Apple ID, і натисніть кнопку встановлення SideStore.</li>
        <li>Введіть пароль Apple ID і код підтвердження, якщо попросить. Дочекайтесь, поки встановлення завершиться.</li>
        <li>Далі комп’ютер уже не потрібен — усе робиться на телефоні.</li>
      </>
    ),
  },
  {
    title: 'Увімкніть режим розробника',
    short: 'Параметри → Приватність і безпека → Режим розробника.',
    details: (
      <>
        <li>Пункт з’являється після встановлення SideStore — він у самому низу розділу.</li>
        <li>Увімкніть, iPhone перезавантажиться. Після ввімкнення підтвердіть «Увімкнути» і введіть код-пароль.</li>
      </>
    ),
  },
  {
    title: 'Довіртеся розробнику',
    short: 'Параметри → Загальні → VPN і керування пристроями.',
    details: (
      <>
        <li>У розділі «Програма розробника» виберіть свій Apple ID.</li>
        <li>Натисніть «Довіряти …» і підтвердіть. Тепер SideStore відкривається.</li>
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
        <li>Відкрийте SideStore і увійдіть тим самим Apple ID, що в Sideloadly.</li>
        <li>У вкладці <b>My Apps</b> натисніть <b>SideStore «7 DAYS»</b>, щоб оновити його підпис, і прийміть запити.</li>
        <li>Натисніть <b>«+»</b> угорі й виберіть MyWallet.ipa з «Файли → Завантаження». Дочекайтесь встановлення.</li>
        <li>
          Якщо SideStore просить pairing file — перевстановіть його через офіційний{' '}
          <A href={ILOADER_URL}>iloader</A> (він додає цей файл сам).
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
  const iosApp = useIosApp()
  const installed = !!iosApp?.installed
  const onIPhone = isIPhoneBrowser()
  const [openStep, setOpenStep] = useState(null)
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
              <div className="text-white/55 text-xs mt-0.5">Нову збірку можна завантажити тут у будь-який момент.</div>
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
