
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
            print(f"Auth header present: {auth_header[:15]}...")
            
            # Ensure the auth processing happens correctly
            if auth_header.startswith('Token '):
                token_key = auth_header.split(' ')[1]
                from rest_framework.authtoken.models import Token
                try:
                    token = Token.objects.get(key=token_key)
                    print(f"Found token for user: {token.user.username}")
                    request.user = token.user
                except Token.DoesNotExist:
                    print(f"Token not found in database: {token_key[:10]}...")
                except Exception as e:
                    print(f"Error processing token: {str(e)}")
        else:
            # Only log for endpoints that typically require authentication
            auth_required_paths = ['/users/profile/', '/users/progress/', '/users/session/']
            if any(request.path.startswith(path) for path in auth_required_paths):
                print("No authorization header found for authenticated endpoint")
        
        response = self.get_response(request)
        
        if response.status_code >= 400 and auth_header:
            print(f"User authenticated: {request.user.is_authenticated}")
        
        # Only log response status for errors
        if response.status_code >= 400:
            print(f"Response status: {response.status_code}")
            if response.status_code >= 500:
                print(f"Server error on path: {request.path}")
        
        return response