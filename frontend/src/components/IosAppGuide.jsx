import { CheckCircle2, Download, ExternalLink, Laptop, Smartphone, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import BaseModal from './BaseModal'
import { IOS_BUILDS_URL, SIDELOADLY_URL, isIPhoneBrowser, markIosAppInstalled, useIosApp } from '../utils/iosApp'

const link = 'text-brand font-semibold inline-flex items-center gap-0.5 hover:underline'

const STEPS = [
  {
    title: 'Завантажте файл додатку',
    text: (
      <>
        Кнопка вище → остання збірка → <b>Artifacts</b> → <b>WalletMobile-iOS</b>. Розпакуйте zip — всередині{' '}
        <b>WalletMobile.ipa</b>.
      </>
    ),
  },
  {
    title: 'Встановіть Sideloadly на комп’ютер',
    text: (
      <>
        <a href={SIDELOADLY_URL} target="_blank" rel="noreferrer" className={link}>
          sideloadly.io <ExternalLink size={12} />
        </a>{' '}
        — для Windows і Mac. На Windows також потрібні iTunes та iCloud з сайту Apple (не з Microsoft Store).
      </>
    ),
  },
  {
    title: 'Підключіть iPhone кабелем',
    text: 'Розблокуйте телефон і натисніть «Довіряти цьому комп’ютеру».',
  },
  {
    title: 'Перетягніть .ipa у Sideloadly',
    text: 'Введіть свій Apple ID (пароль вводиться лише в Sideloadly, для Apple) і натисніть Start.',
  },
  {
    title: 'Увімкніть режим розробника',
    text: 'На iPhone: Параметри → Приватність і безпека → Режим розробника. Телефон перезавантажиться.',
  },
  {
    title: 'Довіртесь розробнику',
    text: 'Параметри → Загальні → VPN і керування пристроями → ваш Apple ID → «Довіряти».',
  },
  {
    title: 'Відкрийте MyWallet',
    text: 'Увійдіть тим самим Google-акаунтом — усі картки й транзакції вже там.',
  },
]

/** "MyWallet для iPhone": how to install the app (Sideloadly) and where to get the newest build */
export default function IosAppGuide({ open, onClose }) {
  const iosApp = useIosApp()
  const installed = !!iosApp?.installed
  const onIPhone = isIPhoneBrowser()

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
              Додаток встановлюється з комп’ютера: відкрийте цю сторінку на Windows або Mac і підключіть iPhone кабелем.
            </div>
          </div>
        )}

        <div>
          <a
            href={IOS_BUILDS_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Завантажити останню збірку
          </a>
          <p className="text-[11px] text-white/40 text-center mt-1.5">
            GitHub · потрібен акаунт GitHub · кожна збірка зберігається 30 днів
          </p>
        </div>

        <ol className="rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] divide-y divide-white/[0.06]">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 px-3.5 py-3">
              <span className="h-7 w-7 shrink-0 rounded-full bg-brand/15 text-orange-300 text-sm font-bold grid place-items-center">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-white">{step.title}</div>
                <div className="text-[13px] text-white/60 mt-0.5 leading-snug">{step.text}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-start gap-2.5 rounded-2xl bg-brand/[0.08] border border-brand/25 px-3.5 py-3 text-[13px] text-white/75">
          <Smartphone size={18} className="text-brand shrink-0 mt-px" />
          <div>
            <b className="text-white">Раз на 7 днів</b> безкоштовний Apple ID потребує переустановки: повторіть крок 4 (або
            увімкніть у Sideloadly автоматичне оновлення). Дані не зникнуть. Оновлення коду додаток завантажує сам при
            запуску.
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
