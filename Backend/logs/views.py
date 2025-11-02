from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Log
from django.db import connection
from django.utils import timezone as dj_timezone
from django.utils.timezone import get_current_timezone_name, localtime
from .serializers import LogSerializer
from django.contrib.auth import get_user_model
from rest_framework.pagination import PageNumberPagination

User = get_user_model()

class LogPagination(PageNumberPagination):
    page_size = 20

class LogViewSet(viewsets.ModelViewSet):
    queryset = Log.objects.all()
    serializer_class = LogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LogPagination

    def get_queryset(self):
        return Log.objects.filter(user=self.request.user).order_by('-timestamp')

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all logs as read for the requesting user"""
        logs = self.get_queryset().filter(read=False)
        count = logs.update(read=True)
        return Response({'status': 'all logs marked as read', 'count': count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a specific log as read"""
        log = self.get_object()
        log.read = True
        log.save()
        return Response({'status': 'log marked as read'}, status=status.HTTP_200_OK)
        
    @action(detail=False, methods=['get'])
    def unread(self, request):
        """Get only unread logs for the user"""
        logs = self.get_queryset().filter(read=False)
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)


def create_log(user=None, level="INFO", message="", action="", entity_type=None, entity_id=None, request=None):
    """
    Helper function to create logs programmatically from anywhere in the app
    """
    from .models import Log
    
    # Determine client-local timestamp if request carries client timezone header
    client_tzname = None
    local_ts = None
    if request:
        client_tzname = request.headers.get('X-Client-Timezone') or request.META.get('HTTP_X_CLIENT_TIMEZONE')
        if client_tzname:
            try:
                from zoneinfo import ZoneInfo
                local_ts = dj_timezone.now().astimezone(ZoneInfo(client_tzname))
            except Exception:
                local_ts = None
    # Fallback to currently active timezone (set by ClientTimezoneMiddleware)
    if local_ts is None:
        try:
            local_ts = localtime(dj_timezone.now())
            client_tzname = client_tzname or get_current_timezone_name()
        except Exception:
            pass

    # Truncate client timezone to fit database field (max 64 chars)
    if client_tzname and len(client_tzname) > 64:
        client_tzname = client_tzname[:64]

    # Prepare local timestamp text with offset if available
    local_ts_text = None
    if local_ts is not None:
        try:
            local_ts_text = local_ts.isoformat()
        except Exception:
            local_ts_text = None

    # Truncate entity_id to fit database field (max 64 chars)
    if entity_id and len(str(entity_id)) > 64:
        entity_id = str(entity_id)[:61] + "..."

    # Determine whether the target DB table has the newer timezone columns.
    def _table_has_columns(table: str, columns: list[str]) -> bool:
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = %s
                    """,
                    [table],
                )
                existing = {row[0] for row in cursor.fetchall()}
            return set(columns).issubset(existing)
        except Exception:
            # If introspection fails for any reason, assume columns exist to avoid silent data loss
            return True

    tz_cols = ["local_timestamp", "local_timestamp_text", "client_timezone"]
    has_tz_columns = _table_has_columns("logs_log", tz_cols)

    if has_tz_columns:
        # Normal path: insert including timezone-related columns
        try:
            return Log.objects.create(
                user=user,
                level=level,
                message=message,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                local_timestamp=local_ts,
                local_timestamp_text=local_ts_text,
                client_timezone=client_tzname,
            )
        except Exception:
            # Don't break primary flow due to logging
            return None
    else:
        # Pre-migration safety: perform a raw insert that excludes missing columns
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO logs_log
                        (user_id, level, message, action, entity_type, entity_id, timestamp, read)
                    VALUES
                        (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        getattr(user, "id", None),
                        level,
                        message,
                        action,
                        entity_type,
                        entity_id,
                        dj_timezone.now(),
                        False,
                    ],
                )
            return None
        except Exception:
            return None

