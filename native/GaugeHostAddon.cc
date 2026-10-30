#include <node_api.h>
#include <cstdlib>
extern "C" char* gauge_host_read(int parent);
extern "C" void gauge_host_stop();

// Node-API is stable across Node/Electron versions. AX calls run inside the
// already-authorized Gauge process, not a separately attributed helper.
napi_value Read(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1], value;
  int32_t parent = 0;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc != 1 || napi_get_value_int32(env, args[0], &parent) != napi_ok || parent <= 0) {
    napi_throw_type_error(env, nullptr, "Expected Gauge process id"); return nullptr;
  }
  char* output = gauge_host_read(parent);
  if (!output) { napi_throw_error(env, nullptr, "Native observer failed"); return nullptr; }
  napi_create_string_utf8(env, output, NAPI_AUTO_LENGTH, &value);
  std::free(output);
  return value;
}
napi_value Stop(napi_env env, napi_callback_info info) {
  gauge_host_stop(); napi_value value; napi_get_undefined(env, &value); return value;
}
napi_value Initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"read", nullptr, Read, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 2, properties);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
