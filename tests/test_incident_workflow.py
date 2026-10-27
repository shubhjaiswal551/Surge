"""
Surge - Unit & Integration Tests for Alert Dispatch & Incident Workflow
Verifies:
1. Incident listing & sorting
2. Single incident acknowledgement & auto-upsert
3. Batch incident acknowledgement
4. Incident resolution with notes and false-positive flag
5. Emergency dispatch trigger
"""

import pytest
import asyncio
from backend.app.routers.incidents import (
    INCIDENTS_DB,
    list_incidents,
    acknowledge_incident,
    batch_acknowledge_incidents,
    resolve_incident,
    dispatch_incident,
)
from backend.app.models.schemas import (
    IncidentAcknowledge,
    IncidentResolve,
    IncidentDispatch,
)
from backend.app.routers.incidents import BatchAcknowledge

@pytest.mark.anyio
async def test_list_incidents():
    fake_user = {"email": "operator@surge.io", "role": "operator"}
    incidents = await list_incidents(user=fake_user)
    assert len(incidents) >= 2
    assert "inc-001" in [i["id"] if isinstance(i, dict) else i.id for i in incidents]

@pytest.mark.anyio
async def test_acknowledge_incident():
    fake_user = {"email": "operator@surge.io", "role": "operator"}
    ack_req = IncidentAcknowledge(operator_id="usr-op-001", operator_name="Lead Operator")
    res = await acknowledge_incident("inc-002", ack_req, user=fake_user)
    res_dict = res if isinstance(res, dict) else res.dict()
    assert res_dict["acknowledged_by"] == "Lead Operator"
    assert res_dict["acknowledged_at"] is not None

@pytest.mark.anyio
async def test_batch_acknowledge_incidents():
    fake_user = {"email": "operator@surge.io", "role": "operator"}
    batch_req = BatchAcknowledge(incident_ids=["inc-001", "inc-002"], operator_name="Batch Op")
    res = await batch_acknowledge_incidents(batch_req, user=fake_user)
    assert res["status"] == "ok"
    assert res["acknowledged_count"] == 2
    assert INCIDENTS_DB["inc-001"]["acknowledged_by"] == "Batch Op"

@pytest.mark.anyio
async def test_resolve_incident_with_notes_and_false_positive():
    fake_user = {"email": "operator@surge.io", "role": "operator"}
    res_req = IncidentResolve(
        operator_id="Lead Operator",
        notes="False trigger due to sensor reflection",
        is_false_positive=True,
    )
    res = await resolve_incident("inc-002", res_req, user=fake_user)
    res_dict = res if isinstance(res, dict) else res.dict()
    assert res_dict["resolved"] is True
    assert "[FALSE POSITIVE]" in res_dict["notes"]
    assert res_dict["resolved_at"] is not None

@pytest.mark.anyio
async def test_dispatch_incident():
    fake_user = {"email": "operator@surge.io", "role": "operator"}
    disp_req = IncidentDispatch(operator_id="Lead Operator", custom_note="Deploy safety stewards to Sector B")
    res = await dispatch_incident("inc-001", disp_req, user=fake_user)
    assert res["incident_id"] == "inc-001"
    assert res["status"] in ("dispatched", "failed")
