import os
import re

filepath = r'c:\Users\conex\Desktop\CEI\finance-ai\frontend\src\services\data.ts'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove mock imports
content = re.sub(r"import [a-zA-Z0-9]+ from '@\/mock-db\/[a-zA-Z0-9\-]+\.json';\n", "", content)

# 2. Remove delay function
content = content.replace("export const delay = (ms: number = 100) => new Promise((resolve) => setTimeout(resolve, ms));\n\n", "")

# 3. Replace CostCenters specific logic since it didn't even call apiGet
cost_centers_old = """export async function fetchCostCenters(companyId: string = 'COMP001'): Promise<CostCenter[]> {
  await delay(150);
  return (costCentersData as CostCenter[]).filter(cc => cc.company_id === companyId);
}"""
cost_centers_new = """export async function fetchCostCenters(companyId: string = 'COMP001'): Promise<CostCenter[]> {
  const data = await apiGet<CostCenter[]>(`/cost-centers?company_id=${companyId}`);
  return data || [];
}"""
content = content.replace(cost_centers_old, cost_centers_new)

# 4. For Users
users_old = """export async function fetchUsers(): Promise<User[]> {
  const u = await fetchCurrentUser();
  if (u) return [u];
  await delay(100);
  return usersData as User[];
}"""
users_new = """export async function fetchUsers(): Promise<User[]> {
  const u = await fetchCurrentUser();
  if (u) return [u];
  return [];
}"""
content = content.replace(users_old, users_new)

# 5. Generic array returns with fallback
# e.g., if (data) return data;\n  await delay(100);\n  return companiesData as Company[];
content = re.sub(
    r"if \(data\) return data;\s*await delay\(\d+\);\s*return [a-zA-Z0-9]+( as [a-zA-Z0-9\[\]<>]+)?;",
    r"return data || [];",
    content
)

# 6. Filtered array returns
# e.g., if (data) return data;\n  await delay(200);\n  return (transactionsData as Transaction[]).filter(t => t.company_id === companyId);
content = re.sub(
    r"if \(data\) return data;\s*await delay\(\d+\);\s*return \([a-zA-Z0-9]+ as [a-zA-Z0-9\[\]]+\)\.filter\([^\)]+\);",
    r"return data || [];",
    content
)

# 7. Single object return for fetchTransaction
content = re.sub(
    r"if \(data\) return data;\s*await delay\(\d+\);\s*return \([^\)]+\)\.find\([^\)]+\) \|\| null;",
    r"return data || null;",
    content
)

# 8. Single object return for health score
content = re.sub(
    r"if \(data\) return data;\s*await delay\(\d+\);\s*return healthScoreData as FinancialHealthScore;",
    r"return data || ({} as FinancialHealthScore);",
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated data.ts!")
