import chevron
import json
import lxml.html
import prairielearn as pl
import shared_utils as su
from tree_builder.utils import TreeBuilderNode as Node
from typing_extensions import assert_never

def prepare(element_html: str, data: su.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    pl.check_attribs(element, required_attribs, [])

    name = pl.get_string_attrib(element, 'answers-name')

    data['params'][name] = dict()


def render(element_html: str, data: su.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    editable = data['editable']
    display_dict_name = f'{name}-raw'
    display_json = data['submitted_answers'].get(display_dict_name, None)

    if data['panel'] == 'question':
        html_params = {
            'question': True,
            'answers_name': name,
            'display_json': display_json,
            'editable': editable
        }

        with open('tree-builder.mustache', 'r') as f:
            return chevron.render(f, html_params).strip()
    elif data['panel'] == 'submission':
        html_params = {
            'submission': True
        }
        if name in data['format_errors']:
            html_params['parse_errors'] = data['format_errors'][name]
        elif name in data['partial_scores']:
            html_params['feedback'] = data['partial_scores'][name].get('feedback', None)
        with open('tree-builder.mustache', 'r') as f:
            return chevron.render(f, html_params).strip()

    # Nothing interesting to display in correct answer panel, should just hide
    elif data['panel'] == 'answer':
        return ''

    assert_never(data['panel'])


def parse(element_html: str, data: su.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    try:
        tree_json = json.loads(data['raw_submitted_answers'][name+'-raw'])
    except:
        data['format_errors'][name] = {'message': f'Invalid JSON for {name}'}
        return

    if tree_json['root'] == None:
        data['format_errors'][name] = {'message': "Empty tree"}
        return

    root: Node = Node(tree_json['root']['text'].strip(),
                build_tree(tree_json['root']['left']),
                build_tree(tree_json['root']['right']))

    output_json = json.dumps(root)

    data['submitted_answers'][name] = output_json


def build_tree(json) -> Node:
    if json == None:
        return None

    return Node(json['text'].strip(), build_tree(json['left']), build_tree(json['right']))
