import json
import os
from datetime import datetime


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
    response = model.generate_content(prompt, **kwargs)
    end_ts = datetime.now()

    # Extract system instruction if available
    system_instruction = getattr(model, '_system_instruction', None)
    if system_instruction:
        system_instruction = str(system_instruction)

    if hasattr(response, 'candidates'):
        # Gemini responses where multiple candidates were requested have a different format; extract text from each candidate
        response_text = [candidate.content.parts[0].text for candidate in response.candidates]
    elif hasattr(response, 'text'):
        # We must jut have one response, get its text
        response_text = response.text
    else:
        # Generic fallback in case something else happens
        response_text = str(response)

    # Prepare log entry
    log_entry = {
        "start_timestamp": start_ts.isoformat(),
        "end_timestamp": end_ts.isoformat(),
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
    log_file = os.path.join(log_dir, f"gemini_logs_{start_ts.strftime('%Y.%m.%d.%H.%M.%S.%f')}.json")

    with open(log_file, 'w') as f:
        json.dump(log_entry, f, indent=2)

    return response