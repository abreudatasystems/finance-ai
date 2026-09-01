"""Multi-company logins, invitations and roles.

The active company travels in X-Company-Id and is only honoured after the
membership check — that is the whole of the tenant isolation.
"""

def _invite(tenant, email="convidado@exemplo.pt", role="finance_manager"):
    response = tenant.post(f"/api/v1/invitations/company/{tenant.company_id}",
                           {"email": email, "role": role})
    assert response.status_code == 201, response.text
    return response.json()


def test_a_login_can_open_several_companies(tenant):
    created = tenant.post("/api/v1/companies/", {"name": "Consultoria Unip. Lda"})
    assert created.status_code == 201
    assert created.json()["role"] == "owner"
    assert len(tenant.get("/api/v1/companies/").json()) == 2


def test_a_repeated_company_name_is_refused(tenant):
    name = tenant.get("/api/v1/companies/").json()[0]["name"]
    assert tenant.post("/api/v1/companies/", {"name": name}).status_code == 409


def test_each_company_gets_its_own_chart(tenant):
    second = tenant.post("/api/v1/companies/", {"name": "Segunda Lda"}).json()["id"]
    first_chart = tenant.get("/api/v1/categories/").json()
    second_chart = tenant.client.get("/api/v1/categories/", headers=tenant.scoped(second)).json()
    assert len(first_chart) == len(second_chart) == 12


def test_two_companies_never_mix_their_movements(tenant):
    second = tenant.post("/api/v1/companies/", {"name": "Segunda Lda"}).json()["id"]
    tenant.book(description="Farinha", amount=100)

    cats = tenant.client.get("/api/v1/categories/", headers=tenant.scoped(second)).json()
    expense = next(c for c in cats if c["type"] == "expense")
    tenant.client.post("/api/v1/transactions/", headers=tenant.scoped(second), json={
        "date": "2026-08-01", "type": "expense", "description": "Portátil",
        "entity_name": "Worten", "category_id": expense["id"], "category_name": expense["name"],
        "amount": 900, "is_paid": False,
    })

    first = [t["description"] for t in tenant.get("/api/v1/transactions/").json()]
    other = [t["description"] for t in
             tenant.client.get("/api/v1/transactions/", headers=tenant.scoped(second)).json()]
    assert first == ["Farinha"] and other == ["Portátil"]


def test_a_forged_company_header_is_refused(tenant):
    response = tenant.client.get(
        "/api/v1/transactions/",
        headers={**tenant.headers, "X-Company-Id": "COMP-INEXISTENTE"},
    )
    assert response.status_code == 404


def test_invitation_cannot_hand_out_ownership(tenant):
    response = tenant.post(f"/api/v1/invitations/company/{tenant.company_id}",
                           {"email": "x@exemplo.pt", "role": "owner"})
    assert response.status_code == 400


def test_registering_from_an_invitation_creates_a_guest_account(client, tenant):
    invitation = _invite(tenant, "guest1@exemplo.pt")
    preview = client.get(f"/api/v1/invitations/token/{invitation['token']}").json()
    assert preview["account_exists"] is False

    joined = client.post("/api/v1/invitations/register", json={
        "token": invitation["token"], "name": "João", "password": "segredo123",
    })
    assert joined.status_code == 201
    guest = {"Authorization": f"Bearer {joined.json()['access_token']}"}

    me = client.get("/api/v1/auth/me", headers=guest).json()
    assert me["account_type"] == "invited"
    assert me["can_create_companies"] is False

    refused = client.post("/api/v1/companies/", headers=guest, json={"name": "Empresa do João"})
    assert refused.status_code == 403


def test_a_guest_sees_only_the_company_that_invited_them(client, tenant):
    second = tenant.post("/api/v1/companies/", {"name": "Segunda Lda"}).json()["id"]
    tenant.book(description="Fatura da luz", amount=75)

    invitation = _invite(tenant, "guest2@exemplo.pt")
    token = client.post("/api/v1/invitations/register", json={
        "token": invitation["token"], "name": "Rita", "password": "segredo123",
    }).json()["access_token"]
    guest = {"Authorization": f"Bearer {token}"}

    assert len(client.get("/api/v1/transactions/", headers=guest).json()) == 1
    blocked = client.get("/api/v1/transactions/", headers={**guest, "X-Company-Id": second})
    assert blocked.status_code == 404


def test_a_viewer_reads_but_cannot_write(client, tenant):
    invitation = _invite(tenant, "guest3@exemplo.pt", role="viewer")
    token = client.post("/api/v1/invitations/register", json={
        "token": invitation["token"], "name": "Zé", "password": "segredo123",
    }).json()["access_token"]
    viewer = {"Authorization": f"Bearer {token}"}
    category = tenant.category("expense")

    assert client.get("/api/v1/transactions/", headers=viewer).status_code == 200
    write = client.post("/api/v1/transactions/", headers=viewer, json={
        "date": "2026-08-01", "type": "expense", "description": "Não devia passar",
        "entity_name": "X", "category_id": category["id"], "category_name": category["name"],
        "amount": 10,
    })
    assert write.status_code == 403
    invite = client.post(f"/api/v1/invitations/company/{tenant.company_id}",
                         headers=viewer, json={"email": "z@exemplo.pt", "role": "viewer"})
    assert invite.status_code == 403


def test_a_company_is_never_left_without_an_owner(tenant):
    members = tenant.get(f"/api/v1/companies/{tenant.company_id}/members").json()
    owner = next(m for m in members if m["role"] == "owner")
    demote = tenant.patch(f"/api/v1/companies/{tenant.company_id}/members/{owner['user_id']}",
                          {"role": "viewer"})
    assert demote.status_code == 409
    leave = tenant.delete(f"/api/v1/companies/{tenant.company_id}/members/{owner['user_id']}")
    assert leave.status_code == 409


def test_an_existing_login_accepts_an_invitation(client, tenant, other_tenant):
    invitation = _invite(tenant, other_tenant.email, role="admin")
    accepted = client.post("/api/v1/invitations/accept",
                           headers=other_tenant.headers, json={"token": invitation["token"]})
    assert accepted.status_code == 200
    assert len(other_tenant.get("/api/v1/companies/").json()) == 2

    reused = client.post("/api/v1/invitations/accept",
                         headers=other_tenant.headers, json={"token": invitation["token"]})
    assert reused.status_code == 409


def test_an_invitation_addressed_to_someone_else_is_refused(client, tenant, other_tenant):
    invitation = _invite(tenant, "outro@exemplo.pt")
    response = client.post("/api/v1/invitations/accept",
                           headers=other_tenant.headers, json={"token": invitation["token"]})
    assert response.status_code == 403


def test_a_revoked_invitation_stops_working(client, tenant):
    invitation = _invite(tenant, "revogado@exemplo.pt")
    assert tenant.delete(f"/api/v1/invitations/{invitation['id']}").status_code == 200
    assert client.get(f"/api/v1/invitations/token/{invitation['token']}").status_code == 409


def test_member_activity_shows_what_they_moved(client, tenant):
    invitation = _invite(tenant, "guest4@exemplo.pt")
    token = client.post("/api/v1/invitations/register", json={
        "token": invitation["token"], "name": "Maria", "password": "segredo123",
    }).json()["access_token"]
    member = {"Authorization": f"Bearer {token}"}
    category = tenant.category("expense")
    client.post("/api/v1/transactions/", headers=member, json={
        "date": "2026-08-01", "type": "expense", "description": "Material",
        "entity_name": "X", "category_id": category["id"], "category_name": category["name"],
        "amount": 50, "is_paid": False,
    })

    members = tenant.get(f"/api/v1/companies/{tenant.company_id}/members").json()
    maria = next(m for m in members if m["email"] == "guest4@exemplo.pt")
    activity = tenant.get(
        f"/api/v1/companies/{tenant.company_id}/members/{maria['user_id']}/activity"
    ).json()
    assert activity["lancamentos"] == 1
    assert activity["total_saidas"] == 50.0
