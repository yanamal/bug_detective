import json
import os
from datetime import datetime
from google.api_core.exceptions import GoogleAPIError

def generate_content_with_logging(model, endpoint, identifier, prompt, **kwargs):
    """
    Wrapper for model.generate_content that logs all interactions to a JSON file.

    Args:
        model: The Gemini model instance
        prompt: The prompt/query to send to the model
        endpoint: The request endpoint that made this gemini request
        (or other identifier of **what** in Bug Detective is making this request)
        identifier: An identifier for the user making the request, e.g. IP address or some other id
        **kwargs: Additional arguments to pass to generate_content

    Returns:
        The response from model.generate_content
    """
    # Generate the response (and record timestamps before/after)
    start_ts = datetime.now()

    response = None
    response_text = None

    try:
        response = model.generate_content(prompt, **kwargs)

    except GoogleAPIError as e:
        response = f'Oops! An API error occurred when the bot tried to generate a response: {e}'
    except Exception as e:
        response = f'Oops! An error occurred when the bot tried to generate a response: {e}'

    end_ts = datetime.now()


    # Extract system instruction if available
    system_instruction = getattr(model, '_system_instruction', None)
    if system_instruction:
        system_instruction = str(system_instruction)

    if hasattr(response, 'candidates') and hasattr(response.candidates[0], 'content'):
        # This condition is true whether or not we asked for more than one candidate response:
        # all responses have at least one candidate;
        # if you requested more than one, then there's a list of several candidates.
        # Otherwise, there is a list of exactly one candidate.
        response_text = [candidate.content.parts[0].text for candidate in response.candidates]
    else:
        # Generic fallback in case something else happens
        # In particular, this handles the case when there was an exception and the response is just a string
        # (The response string is still likely to cause errors when the app tries to parse and process the response;
        # but at least the exact error message will be logged)
        response_text = str(response)

    # Prepare log entry
    log_entry = {
        "start_time": start_ts.isoformat(),
        "start_timestamp": int(start_ts.timestamp() * 1000),
        "end_time": end_ts.isoformat(),
        "end_timestamp": int(end_ts.timestamp() * 1000),
        "system_instruction": system_instruction,
        "prompt": prompt,
        "response": response_text,
        "endpoint": endpoint,
        "identifier": identifier
    }

    # Ensure logs directory exists
    log_dir = "logs"
    os.makedirs(log_dir, exist_ok=True)

    # Create path for timestamped log file
    log_file = os.path.join(log_dir, f"{identifier}_{start_ts.strftime('%Y.%m.%d.%H.%M.%S.%f')}_gemini_logs_{endpoint}.json")

    with open(log_file, 'w') as f:
        json.dump(log_entry, f, indent=2)

    return response