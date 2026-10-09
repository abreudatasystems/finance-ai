import { redirect } from 'next/navigation';

/** As empresas gerem-se na página de escolha, fora do painel de uma empresa. */
export default function CompaniesSettingsPage() {
  redirect('/companies');
}
