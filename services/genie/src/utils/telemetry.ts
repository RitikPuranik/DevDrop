import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { trace } from '@opentelemetry/api'

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'genie-ai-backend',
  }),
})

const exporter = new OTLPTraceExporter()
provider.addSpanProcessor(new SimpleSpanProcessor(exporter))

provider.register()

export const tracer = trace.getTracer('genie-ai-tracer')
