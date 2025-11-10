from flask import Flask, render_template, request, jsonify, Blueprint
import os
import google.generativeai as genai
import json
from gemini_logger import generate_content_with_logging
from utils import get_client_identifier

feedback_bp = Blueprint('feedback', __name__)


@feedback_bp.route('/api/problem_statement_feedback', methods=['POST'])
def gen_problem_statement_feedback():
    data = request.json

    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""You are part of a system which assists beginner programmers in debugging their own Python code. You are a patient Socratic tutor who tries to find and amplify any correct or nearly-correct aspects of what the student has said. You also prefer to help the student come up with the correct answer instead of telling them the answer outright.

Your task is to provide feedback to the student based on their response to a question the system asked. Since you are part of a bigger system, your feedback messages should only include feedback about their response. It should **not** have extraneous information like advice on what to do next."""
    )

    response_format = {
        "type": "object",
        "properties": {
          "step1_feedback_to_student": {
            "type": "string"
          },
          "step2_asked_to_try_again": {
            "type": "boolean"
          }
        },
        "required": ["step1_feedback_to_student", "step2_asked_to_try_again"],
      }

    response = generate_content_with_logging(model, request.endpoint, get_client_identifier(), f'''
This is problem statement for the problem that the student's code is supposed to solve, split up into several pieces:
{data['problem_statement_pieces']}

However, when executing the unit test:
{data['unit_test']}

The student code returned the incorrect value:
{data['student_output']}

The student was asked: "Click on the part of the problem statement which best explains why we expected the code to return {data['correct_output']}."

The system expected the student to click on the part of the problem statement that said "{data['expected_answer']}", although it's possible that other correct answers exist.

The student chose to click on the part that said "{data['clicked_piece']}".

Provide a feedback message to the student which describes whether the part of the problem statement they clicked on explains the expected output.

If the student's response was very far from correct, give them an explanation of what we are looking for and encourage them to try again.

Ensure that the message just provides feedback about their response, and does not provide any extraneous information or suggestions.

After generating the feedback message, indicate whether you asked the student to try again.
''',
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema = response_format
        )
    )


    result = {
        "message": "problem feedback",
        "results": {
            "input_data": data,
            "problem_feedback_data": json.loads(response.text)
        }
    }

    return jsonify(result)


@feedback_bp.route('/api/exception_feedback', methods=['POST'])
def gen_exception_feedback():
    data = request.json

    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""You are part of a system which assists beginner programmers in debugging their own Python code. You are a patient Socratic tutor who tries to find and amplify any correct or nearly-correct aspects of what the student has said. You also prefer to help the student come up with the correct answer instead of telling them the answer outright.

Your task is to provide feedback to the student based on their response to a question the system asked. Since you are part of a bigger system, your feedback messages should only include feedback about their response. It should **not** have extraneous information like advice on what to do next. """
    )

    response_format = {
        "type": "object",
        "properties": {
          "step1_feedback_to_student": {
            "type": "string"
          },
          "step2_asked_to_try_again": {
            "type": "boolean"
          }
        },
        "required": ["step1_feedback_to_student", "step2_asked_to_try_again"],
      }


    response = generate_content_with_logging(model, request.endpoint, get_client_identifier(), f'''
This is problem statement for the problem that the student's code is supposed to solve, split up into several pieces:
{data['exception_pieces']}

However, when executing the unit test:
{data['unit_test']}

The student code returned the incorrect value:
{data['student_output']}

The student was asked: "{data['exception_question']}."

The system previously identified this list of potential correct answers: {data['expected_answers']}, although it's possible that other correct answers exist.

The student chose to click on the part that said {data['clicked_piece']}.

Provide a feedback message to the student which describes whether the piece they clicked answers the question. Keep in mind that the student does not have control of how the exception message was split into pieces. Therefore, do not penalize or criticize the student if the part they clicked answers the question, but includes too much or too little text compared to the expected answer.

If the student's response was very far from correct, give them an explanation of what we are looking for and encourage them to try again.

Ensure that the message just provides feedback about their response, and does not provide any extraneous information or advice.

After generating the feedback message, indicate whether you asked the student to try again. Do not ask the student to try again if they provided a response that answers the question, but includes too much or too little text compared to the expected answer.
''',
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema = response_format
        )
    )


    result = {
        "message": "exception feedback",
        "results": {
            "input_data": data,
            "exception_feedback_data": json.loads(response.text)
        }
    }

    return jsonify(result)



@feedback_bp.route('/api/direction_feedback', methods=['POST'])
def gen_direction_feedback():
    data = request.json

    # add index so the LLM has something concrete to anchor on
    student_trace = data['execution_trace']
    for i in range(len(student_trace)):
        student_trace[i]['index'] = i

    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""You are part of a system which assists beginner programmers in debugging their own Python code. You are a patient Socratic tutor who tries to find and amplify any correct or nearly-correct aspects of what the student has said. You also prefer to help the student come up with the correct answer instead of telling them the answer outright.

Your task is to provide feedback to the student based on their response to a question the system asked. Since you are part of a bigger system, your feedback messages should only include feedback about their response. It should **not** have extraneous information like advice on what to do next. """
    )

    response_format = {
        "type": "object",
        "properties": {
          "step1_feedback_to_student": {
            "type": "string"
          },
          "step2_asked_to_try_again": {
            "type": "boolean"
          }
        },
        "required": ["step1_feedback_to_student", "step2_asked_to_try_again"],
      }

    response = generate_content_with_logging(model, request.endpoint, get_client_identifier(), f'''
First, review the following information:

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

<execution_trace>
{json.dumps(student_trace, indent=2)}
</execution_trace>

The system previously generated the following suggestion to the student; this suggestion describes which intermediate values and/or code paths they could investigate in order to understand the problem.
<investigation_suggestion>
{data['direction']}
</investigation_suggestion>

The system then asked the student the following question, to check for understanding of the investigation suggestion:
<investigation_question>
{data['question']}
</investigation_question>

The system previously identified that correct answers include execution trace steps with indices {data['correct_answers']}. Answers with these indices should always be considered correct, although it's possible that other correct answers exist.

The student chose the step with index {data['chosen_index']}:
<chosen_step>
{json.dumps(data['chosen_step'], indent=2)}
</chosen_step>

After reviewing the information above, provide a feedback message to the student which describes whether the step they chose answers the question.

If the student's response was very far from correct, give them an explanation of what we are looking for and encourage them to try again.

Ensure that the message just provides feedback about their response, and does not provide any extraneous information or advice.

After generating the feedback message, indicate whether you asked the student to try again.
''',
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema = response_format
        )
    )


    result = {
        "message": "direction feedback",
        "results": {
            "input_data": data,
            "direction_feedback_data": json.loads(response.text)
        }
    }

    return jsonify(result)


# TODO: this really needs prior reasoning about what happens in the code/why this particular unit test went wrong.
#  (sometimes it fixates on an unrelated issue - might have gotten better now that I'm passing the more useful trace?)
@feedback_bp.route('/api/explanation_feedback', methods=['POST'])
def generate_explanation_feedback():
  data = request.json

  # add index so the LLM has something concrete to anchor on
  student_trace = data['execution_trace']
  for i in range(len(student_trace)):
    student_trace[i]['index'] = i

  model = genai.GenerativeModel('gemini-2.0-flash',
    system_instruction="""You are part of an educational system which assists beginner programmers in debugging their own Python code. You are a patient Socratic tutor who tries to find and amplify any correct or nearly-correct aspects of what the student has said. You also prefer to help the student come up with the correct answer instead of telling them the answer outright. Your task is to provide feedback to the student based on their description of why their code produced incorrect output.

When giving feedback and suggestion to the student, assume that they have access to the problem statement, the unit test results, their code, as well as a way to navigate through the provided execution trace using a trace slider interface."""
  )

  response_format = {
    "type": "object",
    "properties": {
        "step1_feedback_to_student": {
        "type": "string"
        },
        "step2_student_explained_sufficiently": {
        "type": "boolean"
        }
    },
    "required": ["step1_feedback_to_student", "step2_student_explained_sufficiently"],
  }

  response = generate_content_with_logging(model, request.endpoint, get_client_identifier(), f'''
First, review the following information about the student code and the problem it was trying to solve:

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

<execution_trace>
{json.dumps(student_trace, indent=2)}
</execution_trace>

Previously, the system has provided the student with the following observations:

<previous_system_output>
**Step 1. How is the output wrong?**
{data['direction']}

**Step 2. What should we look into?**
{data['observation']}

**Step 3. Let's investigate!**
{data['action']}
</previous_system_output>

Now, the system asked the student:
<explanation_question>
**What do you think?** Can you explain why your code didn't do the right thing?
<explanation_question>

And the student responed:
<student_explanation_response>
{data['student_explanation']}
</student_explanation_response>

Provide feedback to this student response. Include the following considerations:
- Did the student identify any correct aspects of where their code went wrong in this execution trace? If so, ackowledge the correct things the student said, and elaborate on them if necessary
- Did the student say something that was explicitly wrong? If so, explain which part you think is incorrect, and why you think so.
- If the student asked any explicit questions, try to answer them in a way that describes programming concepts and constructs, but does not explicitly tell the student why their code is wrong or how to fix it.
- Did the student express any uncertainty or confusion? If so, try to give them a suggestion for how they can think about this question.

Keep in mind that the student was **only** asked why the code didn't do the right thing in this particular execution trace; they are not necessarily trying to explain how the code should be fixed. They are also not trying to reason about other potential problems that did not get triggered in this particular execution trace. If they explain the "why" adequately about this specific execution trace, treat their answer as completely correct.

After providing the feedback, decide whether the student successfully explained why the code didn't do the right thing, or whether they need to update their explanation to be more complete.
''',
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        response_schema = response_format
    ))
# TODO: both the student explanation and your feedback should be focused on why the code didn't do the right thing; not how to fix it.
# TODO: reinsert but better - ask it in a way that doesn't sound like a continuing conversation.
# If necessary, you might then ask a leading question that could hint at how to fix it.


  result = {
      "message": "explanation feedback",
      "results": {
          "input_data": data,
          "explanation_feedback_data": json.loads(response.text)
      }
  }

  return jsonify(result)
