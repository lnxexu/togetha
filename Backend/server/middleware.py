from django.utils import timezone
import logging
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

class ClientTimezoneMiddleware:
    """
    Activate client's timezone for the duration of the request based on header
    X-Client-Timezone (IANA name like 'Asia/Manila'). Falls back to settings.TIME_ZONE.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tzname = request.headers.get('X-Client-Timezone') or request.META.get('HTTP_X_CLIENT_TIMEZONE')
        activated = False
        if tzname and ZoneInfo:
            try:
                timezone.activate(ZoneInfo(tzname))
                activated = True
            except Exception:
                activated = False
        if not activated:
            # Use project default
            timezone.activate(timezone.get_default_timezone())

        response = self.get_response(request)
        # Optionally deactivate; leaving active is fine per request lifecycle
        return response

class CSRFExemptAPIMiddleware:
    """
    Middleware to exempt API endpoints from CSRF checks
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Exempt API endpoints from CSRF
        api_paths = [
            '/users/',
            '/api/',
            '/login/',
            '/signup/',
            '/api-token-auth/',
            '/test_token/',
            '/validate_token/',
        ]
        
        if any(request.path.startswith(path) for path in api_paths):
            setattr(request, '_dont_enforce_csrf_checks', True)
        
        response = self.get_response(request)
        return response


class UserActivityMiddleware:
    """
    Middleware to track user activity for scheduler purposes
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Only track successful requests from authenticated users
        if (response.status_code < 400 and 
            hasattr(request, 'user') and 
            request.user.is_authenticated and 
            request.method in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']):
            
            # Skip tracking for certain endpoints to avoid noise
            skip_paths = [
                '/admin/',
                '/static/',
                '/media/',
                '/favicon.ico',
                '/csrf/',
            ]
            
            if not any(request.path.startswith(path) for path in skip_paths):
                try:
                    from logs.models import UserLog
                    
                    # Get client IP
                    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
                    if x_forwarded_for:
                        ip_address = x_forwarded_for.split(',')[0]
                    else:
                        ip_address = request.META.get('REMOTE_ADDR')
                    
                    # Create user activity log
                    UserLog.objects.create(
                        user=request.user,
                        action=f"{request.method} {request.path}",
                        endpoint=request.path,
                        ip_address=ip_address,
                        user_agent=request.META.get('HTTP_USER_AGENT', '')[:500]  # Limit length
                    )
                except Exception as e:
                    # Don't let logging errors break the request
                    logging.getLogger(__name__).error(f"UserActivityMiddleware error: {str(e)}")
        
        return response


class DebugAuthMiddleware:
    """
    Middleware to debug authentication issues
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Process the token earlier in the request cycle
        auth_header = None
        
        # Check for Authorization header in standard location
        if 'HTTP_AUTHORIZATION' in request.META:
            auth_header = request.META['HTTP_AUTHORIZATION']
        
        # Check for Authorization in headers or cookies
        elif 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            # Move it to where DRF expects it
            request.META['HTTP_AUTHORIZATION'] = auth_header
        
        # Check for token in GET parameters (not recommended but supported for debugging)
        elif request.GET.get('token'):
            auth_header = f"Token {request.GET.get('token')}"
            request.META['HTTP_AUTHORIZATION'] = auth_header
        
        if auth_header:
            logging.getLogger(__name__).debug(f"Auth header present: {auth_header[:15]}...")
            
            # Ensure the auth processing happens correctly
            if auth_header.startswith('Token '):
                token_key = auth_header.split(' ')[1]
                from rest_framework.authtoken.models import Token
                try:
                    token = Token.objects.get(key=token_key)
                    logging.getLogger(__name__).debug(f"Found token for user: {token.user.username}")
                    request.user = token.user
                except Token.DoesNotExist:
                    logging.getLogger(__name__).debug(f"Token not found in database: {token_key[:10]}...")
                except Exception as e:
                    logging.getLogger(__name__).error(f"Error processing token: {str(e)}")
        else:
            # Only log for endpoints that typically require authentication
            auth_required_paths = ['/users/profile/', '/users/progress/', '/users/session/']
            if any(request.path.startswith(path) for path in auth_required_paths):
                logging.getLogger(__name__).debug("No authorization header found for authenticated endpoint")
        
        response = self.get_response(request)
        
        if response.status_code >= 400 and auth_header:
            logging.getLogger(__name__).debug(f"User authenticated: {request.user.is_authenticated}")
        
        # Only log response status for errors
        if response.status_code >= 400:
            logging.getLogger(__name__).warning(f"Response status: {response.status_code}")
            if response.status_code >= 500:
                logging.getLogger(__name__).error(f"Server error on path: {request.path}")
        
        return response