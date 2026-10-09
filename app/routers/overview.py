from fastapi import APIRouter

from app.database import DB
from app.schemas import StatsOut
from app.security import UserDep
from app.services import statistics

router = APIRouter(tags=["Статистика"])


@router.get("/stats", response_model=StatsOut, summary="Статистика текущего пользователя")
def get_stats(db: DB, user: UserDep):
    return statistics(db, user.id)
