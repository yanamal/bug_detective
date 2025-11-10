"""
Utility functions for the Bug Detective application.
"""

from flask import request
import config


def get_client_identifier():
    """
    Get the client identifier based on the configured IDENTIFIER_MODE.

    Checks for custom identifier in this priority order:
    1. JSON body field 'identifier' (for POST requests)
    2. URL query parameter 'identifier'
    3. Configured IDENTIFIER_MODE

    Returns:
        str: The client identifier (IP address or custom identifier)
    """
    # First priority: check for 'identifier' in JSON body (for POST requests)
    if request.is_json:
        json_data = request.get_json(silent=True)
        if json_data and 'identifier' in json_data:
            return json_data['identifier']

    # Second priority: check for 'identifier' in query parameters (URL params or form fields)
    url_identifier = request.values.get('identifier')
    if url_identifier:
        return url_identifier

    elif config.IDENTIFIER_MODE == 'x_real_ip':
        return request.headers.get('X-Real-IP', 'unknown')
    else:  # 'remote_addr' or default
        return request.remote_addr or 'unknown'
