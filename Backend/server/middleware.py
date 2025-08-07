
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
            print("No authorization header found in request")
            # Only log headers in debug mode to avoid security issues
            print(f"Available headers: {request.META.keys()}")
        
        response = self.get_response(request)
        
        if response.status_code >= 400:
            print(f"User authenticated: {request.user.is_authenticated}")
        
        # Log response status
        print(f"Response status: {response.status_code}")
        return response