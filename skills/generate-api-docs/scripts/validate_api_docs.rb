#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"
require "set"
require "json"

HTTP_METHODS = %w[get put post delete options head patch trace].freeze

def resolve_pointer(root, ref)
  return nil unless ref.is_a?(String) && ref.start_with?("#/")
  ref.delete_prefix("#/").split("/").reduce(root) do |node, token|
    return nil unless node.is_a?(Hash)
    node[token.gsub("~1", "/").gsub("~0", "~")]
  end
end

def resolve_reference(root, value)
  return value unless value.is_a?(Hash) && value.key?("$ref")
  resolved = resolve_pointer(root, value["$ref"])
  return nil unless resolved.is_a?(Hash)
  resolved.merge(value.reject { |key, _| key == "$ref" })
end

def effective_schema(root, schema)
  resolved = resolve_reference(root, schema)
  return nil unless resolved.is_a?(Hash)
  variants = resolved["anyOf"] || resolved["oneOf"]
  if variants.is_a?(Array)
    selected = variants.find do |variant|
      candidate = resolve_reference(root, variant)
      candidate.is_a?(Hash) && candidate["type"] != "null"
    end || variants.first
    selected = effective_schema(root, selected)
    return nil unless selected
    return selected.merge(resolved.reject { |key, _| %w[anyOf oneOf].include?(key) })
  end
  all_of = resolved["allOf"]
  return resolved unless all_of.is_a?(Array)

  all_of.reduce(resolved.reject { |key, _| key == "allOf" }) do |merged, part|
    effective_part = effective_schema(root, part)
    next merged unless effective_part
    merged.merge(effective_part) do |key, left, right|
      if key == "properties" && left.is_a?(Hash) && right.is_a?(Hash)
        left.merge(right)
      elsif key == "required" && left.is_a?(Array) && right.is_a?(Array)
        (left + right).uniq
      else
        right
      end
    end
  end
end

def schema_type(root, schema)
  effective = effective_schema(root, schema)
  return "unknown" unless effective
  type = effective["type"]
  type = type.reject { |candidate| candidate == "null" }.first if type.is_a?(Array)
  type = "object" if type.nil? && effective["properties"].is_a?(Hash)
  if type == "array"
    item_type = schema_type(root, effective["items"])
    return "array<#{item_type}>"
  end
  return "#{type} enum" if effective["enum"].is_a?(Array)
  type.to_s
end

def schema_nullable?(root, schema)
  resolved = resolve_reference(root, schema)
  return false unless resolved.is_a?(Hash)
  return true if resolved["nullable"] == true
  type = resolved["type"]
  return true if type.is_a?(Array) && type.include?("null")
  variants = resolved["anyOf"] || resolved["oneOf"]
  variants.is_a?(Array) && variants.any? do |variant|
    candidate = resolve_reference(root, variant)
    candidate.is_a?(Hash) && candidate["type"] == "null"
  end
end

def field_state(required, schema, root)
  effective = effective_schema(root, schema) || {}
  nullable = schema_nullable?(root, schema)
  "#{required ? 'required' : 'optional'} / #{nullable ? 'nullable' : 'non-null'}"
end

def validate_instance(root, schema, value, path, errors)
  resolved_reference = resolve_reference(root, schema)
  return if resolved_reference.nil?

  if value.nil?
    errors << "#{path} is null but the schema is non-null" unless schema_nullable?(root, schema)
    return
  end

  effective = effective_schema(root, schema)
  return unless effective

  enum = effective["enum"]
  errors << "#{path} value #{value.inspect} is outside enum #{enum.inspect}" if enum.is_a?(Array) && !enum.include?(value)

  type = effective["type"]
  type = type.reject { |candidate| candidate == "null" }.first if type.is_a?(Array)
  type = "object" if type.nil? && effective["properties"].is_a?(Hash)
  valid_type = case type
               when "object" then value.is_a?(Hash)
               when "array" then value.is_a?(Array)
               when "string" then value.is_a?(String)
               when "integer" then value.is_a?(Integer)
               when "number" then value.is_a?(Numeric)
               when "boolean" then value == true || value == false
               else true
               end
  unless valid_type
    errors << "#{path} has #{value.class}, expected #{type}"
    return
  end

  if type == "object"
    properties = effective["properties"] || {}
    missing = Array(effective["required"]) - value.keys
    errors << "#{path} misses required properties: #{missing.sort.join(', ')}" unless missing.empty?
    if effective["additionalProperties"] == false
      unknown = value.keys - properties.keys
      errors << "#{path} has unknown properties: #{unknown.sort.join(', ')}" unless unknown.empty?
    end
    value.each do |name, child|
      validate_instance(root, properties[name], child, "#{path}.#{name}", errors) if properties[name].is_a?(Hash)
    end
  elsif type == "array"
    value.each_with_index do |child, index|
      validate_instance(root, effective["items"], child, "#{path}[#{index}]", errors)
    end
  end
end

def flatten_schema_fields(root, schema, prefix = nil, required = true, fields = {}, record_object = true)
  effective = effective_schema(root, schema)
  return fields unless effective

  if effective["type"] == "array"
    item_prefix = prefix ? "#{prefix}[]" : nil
    item = effective_schema(root, effective["items"])
    if prefix
      fields[item_prefix] = { type: schema_type(root, schema), state: field_state(required, schema, root) }
    end
    flatten_schema_fields(root, item, item_prefix, true, fields, false) if item && (item["type"] == "object" || item["properties"].is_a?(Hash))
    return fields
  end

  properties = effective["properties"]
  unless properties.is_a?(Hash)
    fields[prefix] = { type: schema_type(root, schema), state: field_state(required, schema, root) } if prefix
    return fields
  end
  if prefix && record_object
    fields[prefix] = { type: schema_type(root, schema), state: field_state(required, schema, root) }
  end
  required_names = Array(effective["required"]).to_set
  properties.each do |name, property_schema|
    child_prefix = prefix ? "#{prefix}.#{name}" : name
    flatten_schema_fields(root, property_schema, child_prefix, required_names.include?(name), fields)
  end
  fields
end

def first_content_schema(container)
  content = container.is_a?(Hash) ? container["content"] : nil
  return nil unless content.is_a?(Hash)
  media = content.values.find { |value| value.is_a?(Hash) && value["schema"].is_a?(Hash) }
  media && media["schema"]
end

def abort_usage
  warn "Usage: validate_api_docs.rb <openapi.yaml> <api.md>"
  exit 2
end

abort_usage unless ARGV.length == 2

yaml_path, markdown_path = ARGV
errors = []

begin
  document = YAML.safe_load(File.read(yaml_path), permitted_classes: [], permitted_symbols: [], aliases: false)
rescue StandardError => e
  warn "OpenAPI YAML parse failed: #{e.message}"
  exit 1
end

unless document.is_a?(Hash)
  warn "OpenAPI root must be a mapping"
  exit 1
end

version = document["openapi"].to_s
errors << "openapi must be a 3.1.x version" unless version.match?(/\A3\.1\.\d+\z/)

info = document["info"]
errors << "info must be a mapping" unless info.is_a?(Hash)
if info.is_a?(Hash)
  errors << "info.title must be non-empty" if info["title"].to_s.strip.empty?
  errors << "info.version must be non-empty" if info["version"].to_s.strip.empty?
end

paths = document["paths"]
errors << "paths must be a non-empty mapping" unless paths.is_a?(Hash) && !paths.empty?

operations = {}
operation_ids = {}
operation_response_statuses = {}
operation_request_fields = {}
operation_response_fields = {}
operation_response_schemas = {}

if paths.is_a?(Hash)
  paths.each do |path, path_item|
    unless path.is_a?(String) && path.start_with?("/")
      errors << "path #{path.inspect} must start with /"
      next
    end
    path_item = resolve_reference(document, path_item)
    unless path_item.is_a?(Hash)
      errors << "path item #{path} must be a mapping"
      next
    end

    HTTP_METHODS.each do |method|
      operation = path_item[method]
      next if operation.nil?
      unless operation.is_a?(Hash)
        errors << "#{method.upcase} #{path} must be a mapping"
        next
      end

      key = [method.upcase, path]
      operation_id = operation["operationId"].to_s.strip
      errors << "#{key.join(' ')} needs operationId" if operation_id.empty?
      if !operation_id.empty? && operation_ids.key?(operation_id)
        errors << "duplicate operationId #{operation_id.inspect} at #{key.join(' ')} and #{operation_ids[operation_id].join(' ')}"
      else
        operation_ids[operation_id] = key unless operation_id.empty?
      end
      operations[key] = operation_id

      request_fields = {}
      request_body = resolve_reference(document, operation["requestBody"])
      request_schema = first_content_schema(request_body)
      body_fields = {}
      flatten_schema_fields(document, request_schema, nil, true, body_fields) if request_schema
      body_fields.each do |name, contract|
        request_fields[["body", name]] = contract.merge(location: "body", name: name)
      end
      effective_security = operation.key?("security") ? operation["security"] : document["security"]
      if effective_security.is_a?(Array) && !effective_security.empty?
        scheme_names = effective_security.flat_map { |requirement| requirement.is_a?(Hash) ? requirement.keys : [] }.uniq
        schemes = document.dig("components", "securitySchemes") || {}
        scheme_names.each do |scheme_name|
          scheme = resolve_reference(document, schemes[scheme_name])
          next unless scheme.is_a?(Hash)
          header_name = if scheme["type"] == "http" && scheme["scheme"] == "bearer"
                          "Authorization"
                        elsif scheme["type"] == "apiKey" && scheme["in"] == "header"
                          scheme["name"].to_s
                        end
          next if header_name.to_s.empty?
          request_fields[["header", header_name]] = {
            type: "string", state: "required / non-null", location: "header", name: header_name
          }
        end
      end

      responses = operation["responses"]
      errors << "#{key.join(' ')} needs a non-empty responses mapping" unless responses.is_a?(Hash) && !responses.empty?
      if responses.is_a?(Hash)
        operation_response_statuses[key] = responses.keys.map(&:to_s).to_set
        operation_response_fields[key] = {}
        operation_response_schemas[key] = {}
        responses.each do |status, response|
          resolved_response = resolve_reference(document, response)
          unless resolved_response.is_a?(Hash)
            errors << "response #{status.inspect} for #{key.join(' ')} must be a mapping"
            next
          end
          if resolved_response["description"].to_s.strip.empty?
            errors << "response #{status.inspect} for #{key.join(' ')} needs a non-empty description"
          end
          response_fields = {}
          response_schema = first_content_schema(resolved_response)
          flatten_schema_fields(document, response_schema, nil, true, response_fields) if response_schema
          operation_response_fields[key][status.to_s] = response_fields
          operation_response_schemas[key][status.to_s] = response_schema if response_schema
        end
      end

      placeholders = path.scan(/\{([^}]+)\}/).flatten.to_set
      parameters = []
      parameters.concat(path_item["parameters"]) if path_item["parameters"].is_a?(Array)
      parameters.concat(operation["parameters"]) if operation["parameters"].is_a?(Array)
      declared = parameters.map do |parameter|
        resolved_parameter = resolve_reference(document, parameter)
        unless resolved_parameter.is_a?(Hash)
          errors << "parameter for #{key.join(' ')} must be a mapping"
          next
        end
        if resolved_parameter["description"].to_s.strip.empty?
          errors << "parameter #{resolved_parameter['name'].inspect} for #{key.join(' ')} needs a non-empty description"
        end
        parameter_name = resolved_parameter["name"].to_s
        parameter_schema = resolved_parameter["schema"]
        parameter_location = resolved_parameter["in"].to_s
        request_fields[[parameter_location, parameter_name]] = {
          type: schema_type(document, parameter_schema),
          state: field_state(resolved_parameter["required"] == true, parameter_schema, document),
          location: parameter_location,
          name: parameter_name,
        } unless parameter_name.empty?
        next unless resolved_parameter["in"] == "path"
        errors << "path parameter #{resolved_parameter['name'].inspect} for #{key.join(' ')} must set required: true" unless resolved_parameter["required"] == true
        resolved_parameter["name"].to_s
      end.compact.to_set
      missing = placeholders - declared
      extra = declared - placeholders
      errors << "#{key.join(' ')} misses path parameter declarations: #{missing.to_a.sort.join(', ')}" unless missing.empty?
      errors << "#{key.join(' ')} declares path parameters absent from path: #{extra.to_a.sort.join(', ')}" unless extra.empty?
      operation_request_fields[key] = request_fields
    end
  end
end

walk = lambda do |node, location|
  case node
  when Hash
    errors << "#{location} uses OpenAPI 3.0 nullable; use a JSON Schema null union" if node.key?("nullable")
    if node.key?("$ref")
      ref = node["$ref"]
      if !ref.is_a?(String) || !ref.start_with?("#/")
        errors << "#{location} uses non-local $ref #{ref.inspect}"
      elsif resolve_pointer(document, ref).nil?
        errors << "#{location} has unresolved $ref #{ref.inspect}"
      end
    end
    node.each { |key, value| walk.call(value, "#{location}/#{key}") }
  when Array
    node.each_with_index { |value, index| walk.call(value, "#{location}/#{index}") }
  end
end
walk.call(document, "#")

property_walk = lambda do |node, location|
  case node
  when Hash
    properties = node["properties"]
    if properties.is_a?(Hash)
      properties.each do |name, schema|
        unless schema.is_a?(Hash)
          errors << "#{location}/properties/#{name} must be a schema mapping"
          next
        end
        resolved_schema = effective_schema(document, schema)
        if resolved_schema.nil?
          errors << "#{location}/properties/#{name} has an unresolved schema reference"
        elsif resolved_schema["description"].to_s.strip.empty?
          errors << "#{location}/properties/#{name} needs a non-empty description"
        end
      end
    end
    node.each { |key, value| property_walk.call(value, "#{location}/#{key}") }
  when Array
    node.each_with_index { |value, index| property_walk.call(value, "#{location}/#{index}") }
  end
end
property_walk.call(document, "#")

markdown_operations = {}
current_key = nil
current_section = nil
File.foreach(markdown_path).with_index(1) do |line, line_number|
  if (match = line.match(/\A### (GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE) (\/\S*)\s*\z/))
    current_key = [match[1], match[2]]
    if markdown_operations.key?(current_key)
      errors << "Markdown duplicates #{current_key.join(' ')} at line #{line_number}"
    else
      markdown_operations[current_key] = {
        operation_id: nil,
        request_fields: nil,
        response_fields: {},
        response_content: {}
      }
    end
    current_section = nil
  elsif current_key && (match = line.match(/\A- Operation ID: `([^`]+)`\s*\z/))
    if markdown_operations[current_key][:operation_id]
      errors << "Markdown has multiple Operation ID lines for #{current_key.join(' ')}"
    else
      markdown_operations[current_key][:operation_id] = match[1]
    end
  elsif current_key && line.match?(/\A#### Request fields\s*\z/)
    markdown_operations[current_key][:request_fields] = []
    current_section = markdown_operations[current_key][:request_fields]
  elsif current_key && (match = line.match(/\A#### Response fields: (\S+)\s*\z/))
    markdown_operations[current_key][:response_fields][match[1]] = []
    current_section = markdown_operations[current_key][:response_fields][match[1]]
  elsif current_key && (match = line.match(/\A#### Response content: (\S+)\s*\z/))
    markdown_operations[current_key][:response_content][match[1]] = []
    current_section = markdown_operations[current_key][:response_content][match[1]]
  elsif line.start_with?("#### ")
    current_section = nil
  elsif current_section
    current_section << line
  end
end

field_inventory_present = lambda do |lines, empty_marker|
  body = lines.map(&:strip).reject(&:empty?)
  next true if body.include?(empty_marker)
  rows = body.select { |line| line.start_with?("|") }
  rows.count { |line| !line.match?(/\A\|[\s|:-]+\z/) } >= 2
end

parse_field_table = lambda do |lines, request|
  rows = lines.map(&:strip).select { |line| line.start_with?("|") }
  header_index = rows.index { |line| line.match?(/\|\s*Field\s*\|/i) }
  next {} unless header_index
  header = rows[header_index].split("|").map(&:strip).reject(&:empty?)
  fields = {}
  rows.drop(header_index + 2).each do |row|
    cells = row.split("|").map(&:strip).reject(&:empty?)
    next if cells.empty?
    values = header.zip(cells).to_h
    name = values["Field"].to_s.delete("`")
    next if name.empty?
    location = request ? values["Location"].to_s.downcase : nil
    key = request ? [location, name] : name
    fields[key] = {
      name: name,
      type: values["Type"].to_s.delete("`").downcase,
      state: values["Required / Nullable"].to_s.delete("`").downcase,
      location: location,
    }
  end
  fields
end

compare_field_contract = lambda do |key, label, expected, actual|
  missing = expected.keys.to_set - actual.keys.to_set
  allowed_object_containers = expected.keys.each_with_object(Set.new) do |field_key, prefixes|
    next if field_key.is_a?(Array)
    parts = field_key.split(".")
    1.upto(parts.length - 1) { |length| prefixes << parts.first(length).join(".") }
  end
  extra = actual.keys.to_set - expected.keys.to_set - allowed_object_containers
  display_field = lambda do |field_key|
    field_key.is_a?(Array) ? "#{field_key[0]}:#{field_key[1]}" : field_key
  end
  errors << "Markdown #{key.join(' ')} #{label} misses fields: #{missing.map(&display_field).sort.join(', ')}" unless missing.empty?
  errors << "Markdown #{key.join(' ')} #{label} has unknown fields: #{extra.map(&display_field).sort.join(', ')}" unless extra.empty?
  (expected.keys & actual.keys).each do |name|
    expected_type = expected[name][:type].downcase
    actual_type = actual[name][:type]
    unless actual_type == expected_type || actual_type.start_with?("#{expected_type} ")
      errors << "Markdown #{key.join(' ')} #{label} field #{display_field.call(name)} type mismatch: OpenAPI=#{expected_type.inspect}, Markdown=#{actual_type.inspect}"
    end
    expected_state = expected[name][:state].downcase
    if actual[name][:state] != expected_state
      errors << "Markdown #{key.join(' ')} #{label} field #{display_field.call(name)} state mismatch: OpenAPI=#{expected_state.inspect}, Markdown=#{actual[name][:state].inspect}"
    end
  end
end

response_content_present = lambda do |lines|
  body = lines.map(&:strip).reject(&:empty?)
  next true if body.include?("No response body.")
  fence_indexes = body.each_index.select { |index| body[index].start_with?("```") }
  fence_indexes.length >= 2 && fence_indexes.each_slice(2).any? do |start_index, end_index|
    end_index && end_index > start_index + 1
  end
end

parse_json_example = lambda do |lines|
  body = lines.map(&:strip)
  start_index = body.index { |line| line == "```json" }
  next nil unless start_index
  end_index = body.each_index.find { |index| index > start_index && body[index] == "```" }
  next nil unless end_index && end_index > start_index + 1
  JSON.parse(body[(start_index + 1)...end_index].join("\n"))
rescue JSON::ParserError
  nil
end

flatten_example_paths = lambda do |value, prefix = nil, paths = Set.new|
  case value
  when Hash
    paths << prefix if prefix
    value.each do |name, child|
      child_prefix = prefix ? "#{prefix}.#{name}" : name
      flatten_example_paths.call(child, child_prefix, paths)
    end
  when Array
    array_prefix = "#{prefix}[]"
    paths << array_prefix
    flatten_example_paths.call(value.first, array_prefix, paths) unless value.empty?
  else
    paths << prefix if prefix
  end
  paths
end

markdown_operations.each do |key, details|
  errors << "Markdown #{key.join(' ')} needs an Operation ID line" if details[:operation_id].nil?
  if details[:request_fields].nil?
    errors << "Markdown #{key.join(' ')} needs a Request fields section"
  elsif !field_inventory_present.call(details[:request_fields], "None.")
    errors << "Markdown #{key.join(' ')} Request fields section needs a field table or None."
  else
    expected_request = operation_request_fields.fetch(key, {})
    actual_request = parse_field_table.call(details[:request_fields], true)
    compare_field_contract.call(key, "request fields", expected_request, actual_request)
  end

  documented_fields = details[:response_fields].keys.to_set
  documented_content = details[:response_content].keys.to_set
  expected_statuses = operation_response_statuses.fetch(key, Set.new)
  missing_fields = expected_statuses - documented_fields
  extra_fields = documented_fields - expected_statuses
  missing_content = expected_statuses - documented_content
  extra_content = documented_content - expected_statuses
  errors << "Markdown #{key.join(' ')} lacks response fields for statuses: #{missing_fields.to_a.sort.join(', ')}" unless missing_fields.empty?
  errors << "Markdown #{key.join(' ')} has response fields for unknown statuses: #{extra_fields.to_a.sort.join(', ')}" unless extra_fields.empty?
  errors << "Markdown #{key.join(' ')} lacks response content for statuses: #{missing_content.to_a.sort.join(', ')}" unless missing_content.empty?
  errors << "Markdown #{key.join(' ')} has response content for unknown statuses: #{extra_content.to_a.sort.join(', ')}" unless extra_content.empty?
  details[:response_fields].each do |status, lines|
    unless field_inventory_present.call(lines, "No response body.")
      errors << "Markdown #{key.join(' ')} Response fields: #{status} needs a field table or No response body."
    else
      expected_response = operation_response_fields.fetch(key, {}).fetch(status, {})
      actual_response = parse_field_table.call(lines, false)
      compare_field_contract.call(key, "response #{status} fields", expected_response, actual_response)
    end
  end
  details[:response_content].each do |status, lines|
    unless response_content_present.call(lines)
      errors << "Markdown #{key.join(' ')} Response content: #{status} needs a non-empty fenced example or No response body."
      next
    end
    next if lines.map(&:strip).include?("No response body.")
    example = parse_json_example.call(lines)
    if example.nil?
      errors << "Markdown #{key.join(' ')} Response content: #{status} needs valid JSON in a json fence"
      next
    end
    expected_response = operation_response_fields.fetch(key, {}).fetch(status, {})
    response_schema = operation_response_schemas.fetch(key, {})[status]
    validate_instance(document, response_schema, example, "Markdown #{key.join(' ')} response #{status}", errors) if response_schema
    example_paths = flatten_example_paths.call(example)
    allowed_object_containers = expected_response.keys.each_with_object(Set.new) do |field_name, prefixes|
      parts = field_name.split(".")
      1.upto(parts.length - 1) { |length| prefixes << parts.first(length).join(".") }
    end
    unknown_example_paths = example_paths - expected_response.keys.to_set - allowed_object_containers
    required_example_paths = expected_response.map do |name, contract|
      name if contract[:state].start_with?("required")
    end.compact.to_set
    missing_required_paths = required_example_paths - example_paths
    unless unknown_example_paths.empty?
      errors << "Markdown #{key.join(' ')} Response content: #{status} has unknown fields: #{unknown_example_paths.to_a.sort.join(', ')}"
    end
    unless missing_required_paths.empty?
      errors << "Markdown #{key.join(' ')} Response content: #{status} misses required fields: #{missing_required_paths.to_a.sort.join(', ')}"
    end
  end
end

(operations.keys - markdown_operations.keys).sort.each do |key|
  errors << "Markdown is missing #{key.join(' ')}"
end
(markdown_operations.keys - operations.keys).sort.each do |key|
  errors << "OpenAPI is missing #{key.join(' ')}"
end
(operations.keys & markdown_operations.keys).sort.each do |key|
  markdown_operation_id = markdown_operations[key][:operation_id]
  next if operations[key] == markdown_operation_id
  errors << "operationId mismatch for #{key.join(' ')}: OpenAPI=#{operations[key].inspect}, Markdown=#{markdown_operation_id.inspect}"
end

unless errors.empty?
  warn "API documentation validation failed (#{errors.length} errors):"
  errors.each { |error| warn "- #{error}" }
  exit 1
end

puts "API documentation validation passed: #{operations.length} operations, #{operation_ids.length} unique operationIds, all local refs resolved."
