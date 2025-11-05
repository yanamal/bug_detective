from flask import Flask, render_template, request, jsonify, redirect, url_for
import os
import google.generativeai as genai
import json
from datetime import datetime
from conversations import convo_bp
from feedback import feedback_bp
from questions import question_bp
from gemini_logger import generate_content_with_logging

app = Flask(__name__)
app.register_blueprint(convo_bp)
app.register_blueprint(feedback_bp)
app.register_blueprint(question_bp)


def evaluate_candidates(candidates, rubric, problem_data):
    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""You are part of an educational system which assists beginner programmers in debugging their own Python code.

Your task is to evaluate candidate messages to the student based on a rubric, and choose the one that matches the rubric best.
When several messages are equally good in terms of the rubric, you should prefer messages that are more conversational and more brief.
    """
    )

    response_format = {
      "type": "object",
      "properties": {
        "step2_best_message": {
          "type": "string"
        },
        "step1_response_evaluations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "message": {
                "type": "string"
              },
              "per_item_evaluations": {
                "type": "string"
              },
            },
            "required": ["message", "per_item_evaluations"]
          }
        }
      },
      "required": ["step1_response_evaluations", "step2_best_message"]
    }

    response = generate_content_with_logging(model, request.endpoint, request.remote_addr, f'''
The candidate messages pertain to the following data about a particular buggy solution to a programming problem:

{problem_data}


These are the candidate messages to this student:

{json.dumps(candidates, indent=2)}


First, evaluate each candidate based on each item in the following rubric. For **each** item in the rubric, decide on a grade and an explanation of that grade. Then, choose and return the candidate that fits the rubric best.

Rubric:

{rubric}
    ''',
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema = response_format
        )
    )

    return json.loads(response.text)


project_root = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(project_root, 'api_key.txt'), 'r') as apifile:
    api_key = apifile.read().strip()
genai.configure(api_key=api_key)


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/log_interactions', methods=['POST'])
def log_interactions():
    """
    Endpoint to receive client-side interaction logs and save them to a file.
    """
    try:
        # Get the JSON data from the request
        log_data = request.json

        # Ensure logs directory exists
        log_dir = "logs"
        os.makedirs(log_dir, exist_ok=True)

        # Create timestamp in the same format as gemini_logger.py
        timestamp = datetime.now()
        log_file = os.path.join(log_dir, f"client_logs_{timestamp.strftime('%Y.%m.%d.%H.%M.%S.%f')}.json")

        # Write the log data to file
        with open(log_file, 'w') as f:
            json.dump(log_data, f, indent=2)

        return jsonify({"status": "success", "message": "Logs saved successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/observation', methods=['POST'])
def gen_observation():
    data = request.json

    problem_prompt_data = f'''
<problem_statement>
{data['problem_statement']}
</problem_statement>

<unit_test>
{data['unit_test']}
</unit_test>

<student_output>
{data['student_output']}
</student_output>
'''

    # Setup and system prompt
    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""
You are part of an educational system designed to assist beginner programmers in debugging their Python code. Your primary goal is to model the debugging process by illustrating constructive reasoning without revealing specific solutions or hinting at the answer. This approach encourages critical thinking and independent problem-solving.
"""
    )
    # chat = model.start_chat(history=[])

    # TODO: put it in the second prompt.
    ### priming: reason about the problem.
    generic_priming_prompt = f"""
The context below provides data about a particular buggy solution to a programming problem.

{problem_prompt_data}

Reason about how the student may have approached the problem, based on the student code.

Then, describe the most likely explanation for why or how the student might have made the error  that's causing the incorrect output.
    """
    # response_primed = chat.send_message(generic_priming_prompt)

    ### make an observation (description of output) - generate several candidates
    observation_prompt = f"""
Here is the context for the current debugging session:

{problem_prompt_data}

Your task is to provide a brief, observation-style message that describes how the student's code output is incorrect. This message should be phrased as something the student could think or say while debugging their own code, assuming they don't already know what the issue is. It's crucial that you focus solely on describing the incorrect output without suggesting any debugging steps or solutions.

  - If an exception is thrown, this message should describe what the exception is saying in plain English.
  - If the student code returned an incorrect value, this message should describe the returned value in the context of the problem statement, touching on what value was expected and why.

Output Format:
1. The response should be a brief (1-2 sentences) observation about the output.
2. The response should start with phrases like "It looks like...", "It seems that...", or "We can see that...".
3. Ensure your message doesn't hint at the solution or sound like a tutor leading the student to an answer.
4. Use "we" language when appropriate, as if you and the student are debugging the student's code together.
5. Keep the tone curious and friendly.

Remember, your role is to describe the discrepancy between expected and actual output, not to guide the student towards a solution. Avoid making any recommendations or suggestions about how to fix the code.
"""

    ## Generate multiple candidates
    response_candidates = generate_content_with_logging(model, request.endpoint, request.remote_addr,
        observation_prompt,
        generation_config=genai.types.GenerationConfig(
            candidate_count=3,
            temperature=1.5,
            top_p=0.8,
            top_k=80,
            presence_penalty = 0.5,
            frequency_penalty = 0.5
        )
    )

    # Extract the candidate observations
    candidate_observations = []
    for candidate in response_candidates.candidates:
        candidate_observations.append(candidate.content.parts[0].text)

    rubric = '''
1. The message must sound like something you would say if you were debugging the problem and did not yet know what exactly is wrong. It must not sound like a tutor leading the student toward a particilar answer.
2. The message must be specific to the particular problem. It must not sound generic or applicable to any problem.
3. Depending on the output type:
  - If the output is an exception, the message should describe what the exception is saying.
  - If the output is an incorrect value, the message should describe the incorrect value in the context of the problem statement, connecting what we got to what the problem statement expects (not just to what the unit test expected).
4. The message must only provide the description. It must not give any additional speculation or suggestions to the student.
    '''

    evaluation_results = evaluate_candidates(candidate_observations, rubric, problem_prompt_data)

    chosen_observation = evaluation_results['step2_best_message']

    result = {
        "message": "Observation processed",
        "candidate_observations": candidate_observations,
        "observation": chosen_observation,
        "candidate_evaluation": evaluation_results
    }

    return jsonify(result)

# TODO: student can't modify code/print. Don't tell them what to do, anyway.
@app.route('/api/direction', methods=['POST'])
def gen_direction():
    data = request.json

    prev_observation = ''
    if 'observation' in data:
        prev_observation = f'''
The student and the system previously generated an observation about the discrepancy between the expected and actual output; the system summarized this observation in the following way:
"{data['observation']}"
'''

    problem_prompt_data = f'''
<problem_statement>
{data['problem_statement']}
</problem_statement>

<student_code>
{data['student_code']}
</student_code>

<unit_test>
{data['unit_test']}
</unit_test>

<student_output>
{data['student_output']}
</student_output>
'''

    # Setup model with the same system instruction
    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""You are part of an educational system designed to assist beginner programmers in debugging their Python code. Your primary goal is to model the debugging process by illustrating constructive reasoning without revealing specific solutions or hinting at the answer. This approach encourages critical thinking and independent problem-solving.
    """
    )

    # investigation direction
    direction_prompt = f"""

Here is the context for the current debugging session:

{problem_prompt_data}

{prev_observation}

Your task is to provide a student-facing suggestion for a fruitful direction to investigate this incorrect output. Specifically, this direction should aim to investigate "What were the intermediate values that contributed to this output?"

The types of possible directions to investigate could include, but are not limited to:
    - what values were involved in triggering the exception (if there was an exception)
    - what values were involved in calculating the return value (if there was no exception)
    - which relevant branches were and were not taken, and what values contributed to this
    - whether a loop was executed the correct number of times, and what values contributed to this

The student-facing message should be as specific as possible to the actual code and output we are debugging. This message should be phrased as something the student could think or say while debugging their own code, assuming they don't already know what the issue is.

Output Format:
1. The response should be a brief (1-2 sentences) description of a direction to investigate.
2. The response should start with phrases like "Let's figure out...", "Let's try to understand...", "I wonder...", "Let's check...".
3. Ensure your message doesn't hint at the solution or sound like a tutor leading the student to an answer.
4. Include some motivation for why you decided on this direction, or what useful information this direction might uncover.
4. Use "we" language when appropriate, as if you and the student are debugging the student's code together.
5. Keep the tone curious and friendly.

Remember, your role is to describe the investigation direction, not to guide the student towards a solution. Avoid making any recommendations or suggestions about how to fix the code.
    """

    # Generate the direction
    response_candidates = generate_content_with_logging(model, request.endpoint, request.remote_addr,
        direction_prompt,
        generation_config=genai.types.GenerationConfig(
            candidate_count=3,
            temperature=1.5,
            top_p=0.8,
            top_k=80,
            presence_penalty = 0.5,
            frequency_penalty = 0.5
        )
    )

    candidates = []
    for candidate in response_candidates.candidates:
        candidates.append(candidate.content.parts[0].text)

    rubric = '''
1. The message must sound like something you would say if you were debugging the problem and did not yet know what exactly is wrong. It must not sound like a tutor leading the student toward a particilar answer.
2. The message must be specific to the particular problem. It must not sound generic or applicable to any problem.
3. The message must only suggest a direction for investigating the bug. It must not suggest what actions the student should take in order to investigate in that direction.
4. Ideally, the message should motivate how a student debugging this code could have decided on this particular investigation direction
    '''

    evaluation_results = evaluate_candidates(candidates, rubric, problem_prompt_data)

    chosen_direction = evaluation_results['step2_best_message']

    result = {
        "message": "Direction processed",
        "direction": chosen_direction,
        "direction_candidates": candidates,
        "candidate_evaluation": evaluation_results
    }
    return jsonify(result)


# TODO: still need to make it connect it to problem statement more?
# TODO: insert another step (or just return value inside data structure) which JUST writes down which things need to change if step is not applicable?
@app.route('/api/full_trace_description', methods=['POST'])
def gen_full_trace_description():
    data = request.json

    synced_trace = data['synced_trace']

    problem_url = request.referrer
    # problem_name = data['unit_test'].split('(')[0]  # TODO: this is a horrible hack, put problem name into template explicitly instead
    problem_name = problem_url.split('/')[-1].split('?')[0]  # slightly less horrible hack

    if os.path.exists(f'{problem_name}_trace.json'):
        with open(f'{problem_name}_trace.json') as tracef:
            synced_trace = json.load(tracef)

    else:
        ### step 1 - generate canonical descriptions of trace through correct code
        correct_trace = []
        correct_orig_indices = []
        for i in range(len(synced_trace)):
            if synced_trace[i]['after']:
                correct_trace.append(synced_trace[i]['after'])
                correct_orig_indices.append(i)

        correct_trace_prompt_data = f"""
        Programming problem:
        {data['problem_statement']}

        Solution code:
        {data['corrected_code']}

        Unit test:
        {data['unit_test']}

        Execution trace of running this unit test on this solution code:
        { json.dumps(correct_trace, indent=2)}
        """


        trace_model = genai.GenerativeModel('gemini-2.0-flash',
            system_instruction="""You are part of an educational system which assists beginner programmers in debugging their own Python code.
        Your task is to generate short user-facing messages that describe each step in the execution trace of a program. The goal of these messages is to connect what happens in the code with the overall goal of the code, as described by the problem statement. These messages should be accessible to a beginner programmer."""
        )


        correct_trace_response_format = {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "values": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "code": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
            },
            "required": ["values", "code", "description"]
          }
        }


        correct_trace_response = generate_content_with_logging(trace_model,  request.endpoint, request.remote_addr,
                                                               f'''
        {correct_trace_prompt_data}

        For each step in the execution trace, generate a short description of what that step is doing. Note that the execution trace starts **within** the function, skipping the function definition and invocation. Thus, the first step in the execution trace describes the first thing that happens **after** the function is called with the given parameters, and your descriptions do not need to describe the initial function call.

        This description should connect the evaluated expression, and its resulting value(if any), back to the programming problem that the code is solving: it should describe both what is happening, and how this fits into the purpose of the function. Return a JSON object that is the same as the execution trace, but with an additional "description" field in each step.

        ''',
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema = correct_trace_response_format
            )
        )

        # print(correct_trace_response.text)
        correct_trace_with_desc = json.loads(correct_trace_response.text)

        #### Step 2 - generate descriptions for buggy student code (using correlated correct descriptions as guidance)
        # add correct/intended descriptions to synced trace (on both sides)
        for orig_i, step_data in zip(correct_orig_indices, correct_trace_with_desc):
            orig_step = synced_trace[orig_i]
            orig_step['after']['description'] = step_data['description']
            if orig_step['before']:
                # corresponding student node exists
                orig_step['before']['intent_description'] = step_data['description']

        student_trace = []
        student_orig_indices = []
        for i in range(len(synced_trace)):
            if synced_trace[i]['before']:
                student_trace.append(synced_trace[i]['before'])
                student_orig_indices.append(i)

        student_trace_response_format = {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "values": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "code": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "intent_description": {
                "type": "string"
              },
            },
            "required": ["values", "code", "description"]
          }
        }

        student_trace_prompt_data = f"""
        Programming problem:
        {data['problem_statement']}

        Buggy solution code:
        {data['corrected_code']}

        Unit test:
        {data['unit_test']}

        Execution trace of running this unit test on this buggy solution code:
        { json.dumps(student_trace, indent=2)}
        """

        student_trace_response = generate_content_with_logging(trace_model, request.endpoint, request.remote_addr, f'''
        The data below describes a buggy student solution to a programming problem.

        {student_trace_prompt_data}

        For each step in the execution trace, generate a short description of what that step is doing. Note that the execution trace starts **within** the function, skipping the function definition and invocation. Thus, the first step in the execution trace describes the first thing that happens **after** the function is called with the given parameters.

        Some steps in the execution trace have an "intent_description" field, which is a short description of what that step may have **intended** to do. If the intent_description exists, consider whether it is applicable: does it accurately describe what actually happens and what value is generated? If yes, reuse it for the description. If not, change the description to make it accurate and applicable to what actually happens in the code.
        If the current step does not have an intent_description, generate a description from scratch. If this step makes sense in the context of the problem statement, the description should connect what the step does to the problem statement.

        Each description should only describe what the step is doing. It should not comment on why this is correct or wrong.

        Return a JSON object that is the same as the execution trace, but with an additional "description" field in each step. Ensure that each description is correct with respect to what is happening in the code.

        ''',
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema = student_trace_response_format
            )
        )

        # print(student_trace_response.text)

        student_trace_desc = json.loads(student_trace_response.text)

        for orig_i, student_step in zip(student_orig_indices, student_trace_desc):
            synced_trace[orig_i]["before"]["description"] = student_step["description"]


        # write synced trace to file
        with open(f'{problem_name}_trace.json', 'w') as tracef:
            json.dump(synced_trace, tracef, indent=2)


    result = {"message": "Processed", "results": {
            "input_data": data['synced_trace'],
            "trace_with_descs": synced_trace
        }
    }

    return jsonify(result)



@app.route('/api/trace_slice', methods=['POST'])
def gen_trace_slice():
    data = request.json

    # add index so the LLM has something concrete to return
    student_trace = data['student_trace']
    for i in range(len(student_trace)):
        student_trace[i]['index'] = i

    prev_observations = ""
    if 'obervation' in data:
        prev_observations += f'''
**Step 1. How is the output wrong?**
{data['observation']}

'''
    if 'direction' in data:
        prev_observations += f'''
**Step 2. What should we look into?**
{data['direction']}

'''

    problem_prompt_data = f"""
Problem statement:
{data['problem_statement']}

Unit test:
{data['unit_test']}

Student code:
{data['student_code']}

Output of student code after running the unit test (return value or exception message):
{data['student_output']}

Execution trace of running the unit test on the student code:
{json.dumps(student_trace, indent=2)}

In the previous steps, the student and the system may have generated some preliminary observations; the system summarized these observations(if any) in the following way:

<previous_system_output>
{prev_observations}
</previous_system_output>


"""
# Previous analysis of the student's approach and their error:
# {data['diagnostic_reasoning']}

    # Setup and system prompt
    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""You are part of an educational system which assists beginner programmers in debugging their own Python code. The student using this system is able to navigate and view the execution trace of their code executing a particular failing unit test.
Your task is to direct the student toward specific helpful parts of the execution trace. To decide what is helpful in a particular situation, you will incorporate information about the problem the student was solving, their solution and unit test, a previous analysis of the student's approach to the problem, previous messages delivered to the student by the system, and the execution trace itself.
    """
    )

    response_format = {
        "type": "object",
        "properties": {
          "reasoning": {
            "type": "string"
          },
          "start_index": {
            "type": "integer"
          },
          "end_index": {
            "type": "integer"
          },
          "student_call_to_action": {
            "type": "string"
          },
        },
        "required": ["reasoning", "start_index", "end_index", "student_call_to_action"],
        # "propertyOrdering": ["reasoning", "start_index", "end_index", "student_call_to_action"]
      }

    slice_response = generate_content_with_logging(model, request.endpoint, request.remote_addr, f'''
    {problem_prompt_data}

Choose a short (as short as possible) contiguous slice of the execution trace which fits the investigation direction that the system previously suggested, and could help the student understand how the incorrect output happens.

Provide the following, in the order they are listed:
1. your reasoning for the slice you are choosing
2. the start index of the slice (the index of the first step that should be included)
3. the inclusive end index of the slice (the index of the last step that should be included)
4. a short student-facing call to action, which starts with something like "Let's step through the part of the program that..." and briefly describes what the slice does
    ''',
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema = response_format
        )
    )

    # print(slice_response.text)

    result = {
        "message": "Processed",
        "results": {
            "input_data": data,
            "slice_data": json.loads(slice_response.text)
        }
    }

    return jsonify(result)


# Route for tutor flow/sequence
@app.route('/sequence')
def tutorial_sequence():
    page_sequence = [
        'explanation?',  # 0
        'explanation?which_step=step1', # 1
        'roll_die?step2=skip&step3=convo',
        'is_first_bigger?step1=convo&step2=skip&step3=convo',
        'explanation?which_step=step2',  # 4
        'perimeter?step1=inter&step2=convo&step3=inter',
        'roll_die_2?step1=convo&step2=convo&step3=convo',
        'explanation?which_step=step3',  # 7
        'perimeter_2?',
        'only_even?step1=convo&step2=convo&step3=inter',
    ]
    last_completed = request.values.get('completed', -1)

    next_i = int(last_completed)+1
    if len(page_sequence) > next_i:
        return redirect(f'{page_sequence[next_i]}&step={next_i}')

    return 'done'


# Generic catch-all route comes last
@app.route('/<path:page>')
def serve_pages(page):
    # This handles any other URL not handled above
    # e.g., /about becomes page="about"

    # Add .html extension if not already present
    template_name = page if page.endswith('.html') else page + '.html'

    project_root = os.path.dirname(os.path.abspath(__file__))

    template_path = os.path.join(project_root, app.template_folder, template_name)
    if os.path.exists(template_path):
        return render_template(template_name)
    else:
        return "Page not found", 404

if __name__ == '__main__':
    # for rule in app.url_map.iter_rules():
    #   print(rule)
    app.run(debug=True)