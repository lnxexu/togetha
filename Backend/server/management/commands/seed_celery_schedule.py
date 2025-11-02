from django.core.management.base import BaseCommand
from django.conf import settings

try:
    from django_celery_beat.models import PeriodicTask, CrontabSchedule
except Exception as e:  # pragma: no cover - optional dependency
    PeriodicTask = None
    CrontabSchedule = None


class Command(BaseCommand):
    help = "Create or update Celery Beat schedules for task reminders and due checks"

    def handle(self, *args, **options):
        if PeriodicTask is None or CrontabSchedule is None:
            self.stderr.write(
                self.style.ERROR(
                    "django-celery-beat is not installed. Install it and add 'django_celery_beat' to INSTALLED_APPS."
                )
            )
            return 1

        created_or_updated = 0

        def _crontab(minute="*", hour="*", day_of_week="*", day_of_month="*", month_of_year="*"):
            tz = getattr(settings, "CELERY_TIMEZONE", getattr(settings, "TIME_ZONE", "UTC"))
            ct, _ = CrontabSchedule.objects.get_or_create(
                minute=str(minute),
                hour=str(hour),
                day_of_week=str(day_of_week),
                day_of_month=str(day_of_month),
                month_of_year=str(month_of_year),
                timezone=tz,
            )
            return ct

        def _upsert_task(name, task, schedule, enabled=True):
            nonlocal created_or_updated
            obj, created = PeriodicTask.objects.update_or_create(
                name=name,
                defaults={
                    "task": task,
                    "crontab": schedule,
                    "enabled": enabled,
                },
            )
            created_or_updated += 1
            action = "CREATED" if created else "UPDATED"
            self.stdout.write(self.style.SUCCESS(f"{action}: {name} -> {task} @ {schedule}"))

        # Schedules mirroring celery.py app.conf.beat_schedule (but stored in DB)
        try:
            # Every hour at minute 0
            _upsert_task(
                name="check-due-tasks-every-hour",
                task="scheduler.tasks.check_due_tasks",
                schedule=_crontab(minute="0"),
            )

            # Daily at midnight
            _upsert_task(
                name="check-due-tasks-midnight",
                task="scheduler.tasks.check_due_tasks",
                schedule=_crontab(minute="0", hour="0"),
            )

            # Daily at 08:00
            _upsert_task(
                name="check-due-tasks-morning",
                task="scheduler.tasks.check_due_tasks",
                schedule=_crontab(minute="0", hour="8"),
            )

            # Daily at 12:00
            _upsert_task(
                name="check-due-tasks-noon",
                task="scheduler.tasks.check_due_tasks",
                schedule=_crontab(minute="0", hour="12"),
            )

            # Daily at 18:00
            _upsert_task(
                name="check-due-tasks-evening",
                task="scheduler.tasks.check_due_tasks",
                schedule=_crontab(minute="0", hour="18"),
            )

            # Every 15 minutes for upcoming reminders
            _upsert_task(
                name="check-upcoming-task-reminders",
                task="scheduler.tasks.check_upcoming_task_reminders",
                schedule=_crontab(minute="*/15"),
            )

        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Failed creating schedules: {e}"))
            return 1

        self.stdout.write(self.style.SUCCESS(f"Seeded/updated {created_or_updated} periodic task schedules."))
        return 0
